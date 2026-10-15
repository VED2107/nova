//! Play queue: ordered items plus a cursor.
//!
//! Items get stable ids so the UI can address them while the order changes.
//! When the current item is removed, the cursor remembers *where* it was, so
//! "next" continues with the item that moved into that slot.

use serde::Serialize;

pub type QueueItemId = u64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueItem {
    pub id: QueueItemId,
    pub path: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueSnapshot {
    pub items: Vec<QueueItem>,
    pub current_id: Option<QueueItemId>,
    pub has_next: bool,
    pub has_previous: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Cursor {
    None,
    /// Playing `items[i]`.
    At(usize),
    /// The current item was removed; it used to be at index `i`.
    Gap(usize),
}

#[derive(Debug, Default, Clone)]
pub struct Queue {
    items: Vec<QueueItem>,
    cursor: Option<Cursor>,
    next_id: QueueItemId,
}

fn title_of(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_owned())
}

impl Queue {
    pub fn new() -> Self {
        Self::default()
    }

    fn cursor(&self) -> Cursor {
        self.cursor.unwrap_or(Cursor::None)
    }

    fn make(&mut self, path: String) -> QueueItem {
        self.next_id += 1;
        QueueItem {
            id: self.next_id,
            title: title_of(&path),
            path,
        }
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub fn current(&self) -> Option<&QueueItem> {
        match self.cursor() {
            Cursor::At(i) => self.items.get(i),
            _ => None,
        }
    }

    /// Replaces the queue and makes the first item current.
    pub fn replace(&mut self, paths: impl IntoIterator<Item = String>) -> Option<&QueueItem> {
        let items: Vec<_> = paths.into_iter().map(|p| self.make(p)).collect();
        self.items = items;
        self.cursor = Some(if self.items.is_empty() {
            Cursor::None
        } else {
            Cursor::At(0)
        });
        self.current()
    }

    /// Appends items without changing what is playing.
    pub fn append(&mut self, paths: impl IntoIterator<Item = String>) -> Vec<QueueItemId> {
        let new: Vec<_> = paths.into_iter().map(|p| self.make(p)).collect();
        let ids = new.iter().map(|i| i.id).collect();
        self.items.extend(new);
        ids
    }

    pub fn select(&mut self, id: QueueItemId) -> Option<&QueueItem> {
        let i = self.items.iter().position(|it| it.id == id)?;
        self.cursor = Some(Cursor::At(i));
        self.current()
    }

    fn next_index(&self) -> Option<usize> {
        let i = match self.cursor() {
            Cursor::None => 0,
            Cursor::At(i) => i + 1,
            Cursor::Gap(i) => i,
        };
        (i < self.items.len()).then_some(i)
    }

    fn previous_index(&self) -> Option<usize> {
        match self.cursor() {
            Cursor::None => None,
            Cursor::At(i) | Cursor::Gap(i) => i.checked_sub(1),
        }
        .filter(|i| *i < self.items.len())
    }

    /// Advances to the next item. Returns `None` (cursor unchanged) at the end.
    pub fn next_item(&mut self) -> Option<&QueueItem> {
        let i = self.next_index()?;
        self.cursor = Some(Cursor::At(i));
        self.current()
    }

    pub fn previous_item(&mut self) -> Option<&QueueItem> {
        let i = self.previous_index()?;
        self.cursor = Some(Cursor::At(i));
        self.current()
    }

    /// Removes an item. Returns true if it existed.
    pub fn remove(&mut self, id: QueueItemId) -> bool {
        let Some(i) = self.items.iter().position(|it| it.id == id) else {
            return false;
        };
        self.items.remove(i);
        self.cursor = Some(match self.cursor() {
            Cursor::At(c) if c == i => Cursor::Gap(i),
            Cursor::At(c) if c > i => Cursor::At(c - 1),
            Cursor::Gap(c) if c > i => Cursor::Gap(c - 1),
            other => other,
        });
        true
    }

    /// Moves an item to `to` (clamped). The current item stays current.
    pub fn move_item(&mut self, id: QueueItemId, to: usize) -> bool {
        let Some(from) = self.items.iter().position(|it| it.id == id) else {
            return false;
        };
        let current_id = self.current().map(|c| c.id);
        let gap_neighbor = match self.cursor() {
            // Keep a gap anchored to the item that followed the removed one.
            Cursor::Gap(g) => self.items.get(g).map(|it| it.id),
            _ => None,
        };
        let item = self.items.remove(from);
        let to = to.min(self.items.len());
        self.items.insert(to, item);
        if let Some(cid) = current_id {
            let ni = self.items.iter().position(|it| it.id == cid).unwrap();
            self.cursor = Some(Cursor::At(ni));
        } else if let Cursor::Gap(g) = self.cursor() {
            let ni = gap_neighbor
                .and_then(|nid| self.items.iter().position(|it| it.id == nid))
                .unwrap_or(g.min(self.items.len()));
            self.cursor = Some(Cursor::Gap(ni));
        }
        true
    }

    pub fn clear(&mut self) {
        self.items.clear();
        self.cursor = Some(Cursor::None);
    }

    pub fn snapshot(&self) -> QueueSnapshot {
        QueueSnapshot {
            items: self.items.clone(),
            current_id: self.current().map(|c| c.id),
            has_next: self.next_index().is_some(),
            has_previous: self.previous_index().is_some(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q(n: usize) -> Queue {
        let mut q = Queue::new();
        q.replace((1..=n).map(|i| format!("C:/m/{i}.mp4")));
        q
    }

    fn cur(q: &Queue) -> Option<String> {
        q.current().map(|c| c.title.clone())
    }

    #[test]
    fn replace_starts_at_first() {
        let q = q(3);
        assert_eq!(cur(&q).as_deref(), Some("1.mp4"));
        let s = q.snapshot();
        assert!(s.has_next && !s.has_previous);
    }

    #[test]
    fn next_and_previous_walk_in_order_and_stop_at_ends() {
        let mut q = q(3);
        assert_eq!(q.next_item().unwrap().title, "2.mp4");
        assert_eq!(q.next_item().unwrap().title, "3.mp4");
        assert!(q.next_item().is_none());
        assert_eq!(cur(&q).as_deref(), Some("3.mp4"), "cursor unchanged at end");
        assert_eq!(q.previous_item().unwrap().title, "2.mp4");
        assert_eq!(q.previous_item().unwrap().title, "1.mp4");
        assert!(q.previous_item().is_none());
    }

    #[test]
    fn empty_queue_has_nothing() {
        let mut q = Queue::new();
        assert!(q.replace(Vec::<String>::new()).is_none());
        assert!(q.next_item().is_none() && q.previous_item().is_none());
        assert!(!q.snapshot().has_next);
    }

    #[test]
    fn append_keeps_current() {
        let mut q = q(1);
        let ids = q.append(["C:/m/x.mp4".to_string(), "C:/m/y.mp4".to_string()]);
        assert_eq!(ids.len(), 2);
        assert_eq!(cur(&q).as_deref(), Some("1.mp4"));
        assert_eq!(q.next_item().unwrap().title, "x.mp4");
    }

    #[test]
    fn ids_are_unique_across_replace() {
        let mut q = q(2);
        let old: Vec<_> = q.snapshot().items.iter().map(|i| i.id).collect();
        q.replace(["C:/a.mp4".to_string()]);
        assert!(!old.contains(&q.current().unwrap().id));
    }

    #[test]
    fn removing_current_continues_with_following_item() {
        let mut q = q(3);
        q.next_item(); // 2
        let id2 = q.current().unwrap().id;
        assert!(q.remove(id2));
        assert!(q.current().is_none());
        assert_eq!(q.next_item().unwrap().title, "3.mp4");
    }

    #[test]
    fn removing_current_then_previous_goes_back() {
        let mut q = q(3);
        q.next_item();
        let id2 = q.current().unwrap().id;
        q.remove(id2);
        assert_eq!(q.previous_item().unwrap().title, "1.mp4");
    }

    #[test]
    fn removing_last_current_item_ends_queue() {
        let mut q = q(2);
        q.next_item();
        let id = q.current().unwrap().id;
        q.remove(id);
        assert!(q.next_item().is_none());
        assert!(!q.snapshot().has_next);
        assert!(q.snapshot().has_previous);
    }

    #[test]
    fn removing_before_current_shifts_cursor() {
        let mut q = q(3);
        q.next_item();
        q.next_item(); // 3
        let id1 = q.snapshot().items[0].id;
        q.remove(id1);
        assert_eq!(cur(&q).as_deref(), Some("3.mp4"));
        assert_eq!(q.previous_item().unwrap().title, "2.mp4");
    }

    #[test]
    fn move_keeps_current_item_current() {
        let mut q = q(4);
        q.next_item(); // 2
        let id4 = q.snapshot().items[3].id;
        assert!(q.move_item(id4, 0));
        let titles: Vec<_> = q.snapshot().items.iter().map(|i| i.title.clone()).collect();
        assert_eq!(titles, ["4.mp4", "1.mp4", "2.mp4", "3.mp4"]);
        assert_eq!(cur(&q).as_deref(), Some("2.mp4"));
        assert_eq!(q.next_item().unwrap().title, "3.mp4");
    }

    #[test]
    fn move_clamps_target() {
        let mut q = q(3);
        let id1 = q.current().unwrap().id;
        q.move_item(id1, 99);
        assert_eq!(q.snapshot().items.last().unwrap().id, id1);
        assert_eq!(cur(&q).as_deref(), Some("1.mp4"));
        assert!(!q.move_item(12345, 0));
    }

    #[test]
    fn move_while_in_gap_follows_neighbor() {
        let mut q = q(4);
        q.next_item(); // 2
        let id2 = q.current().unwrap().id;
        q.remove(id2); // gap before 3
        let id3 = q.snapshot().items[1].id;
        q.move_item(id3, 2); // [1,4,3]
        assert_eq!(q.next_item().unwrap().title, "3.mp4");
    }

    #[test]
    fn select_and_clear() {
        let mut q = q(3);
        let id3 = q.snapshot().items[2].id;
        assert_eq!(q.select(id3).unwrap().title, "3.mp4");
        assert!(q.select(999).is_none());
        q.clear();
        assert!(q.is_empty() && q.current().is_none());
    }
}
