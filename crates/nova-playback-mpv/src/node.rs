//! Owned Rust copy of an `mpv_node` tree.

use crate::ffi::*;
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq)]
pub enum Node {
    None,
    String(String),
    Flag(bool),
    Int(i64),
    Double(f64),
    Array(Vec<Node>),
    Map(BTreeMap<String, Node>),
}

impl Node {
    /// Deep-copies a libmpv node.
    ///
    /// # Safety
    /// `node` must point to a valid, initialized `mpv_node`.
    pub unsafe fn from_raw(node: *const mpv_node) -> Self {
        let node = unsafe { &*node };
        unsafe {
            match node.format {
                MPV_FORMAT_STRING => Node::String(opt_str(node.u.string).unwrap_or_default()),
                MPV_FORMAT_FLAG => Node::Flag(node.u.flag != 0),
                MPV_FORMAT_INT64 => Node::Int(node.u.int64),
                MPV_FORMAT_DOUBLE => Node::Double(node.u.double_),
                MPV_FORMAT_NODE_ARRAY | MPV_FORMAT_NODE_MAP => {
                    let list = node.u.list;
                    if list.is_null() {
                        return Node::None;
                    }
                    let list = &*list;
                    let n = list.num.max(0) as usize;
                    if node.format == MPV_FORMAT_NODE_ARRAY {
                        Node::Array((0..n).map(|i| Node::from_raw(list.values.add(i))).collect())
                    } else {
                        Node::Map(
                            (0..n)
                                .map(|i| {
                                    let key = opt_str(*list.keys.add(i)).unwrap_or_default();
                                    (key, Node::from_raw(list.values.add(i)))
                                })
                                .collect(),
                        )
                    }
                }
                _ => Node::None,
            }
        }
    }

    pub fn get(&self, key: &str) -> Option<&Node> {
        match self {
            Node::Map(m) => m.get(key),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Node::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Node::Int(i) => Some(*i),
            Node::Double(d) if d.fract() == 0.0 => Some(*d as i64),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Node::Double(d) => Some(*d),
            Node::Int(i) => Some(*i as f64),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Node::Flag(b) => Some(*b),
            _ => None,
        }
    }
}
