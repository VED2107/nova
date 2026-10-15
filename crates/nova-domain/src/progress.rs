//! Watch-progress rules: when to remember a position, when media counts as
//! finished, and where to resume. Pure and deterministic.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ResumePolicy {
    /// Media shorter than this is never resumed (clips, notification sounds).
    pub min_duration_ms: u64,
    /// Positions before this are "just started": nothing to resume.
    pub min_position_ms: u64,
    /// At or beyond this fraction of the duration the media is "completed".
    pub completed_ratio: f64,
    /// Also completed when no more than this remains (credits on short media).
    pub completed_tail_ms: u64,
    /// Resume slightly before the saved position to restore context.
    pub rewind_ms: u64,
}

impl Default for ResumePolicy {
    fn default() -> Self {
        Self {
            min_duration_ms: 60_000,
            min_position_ms: 5_000,
            completed_ratio: 0.95,
            completed_tail_ms: 10_000,
            rewind_ms: 2_000,
        }
    }
}

/// What to persist for an observed position.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProgressDecision {
    /// Not eligible (unknown or too-short duration): leave storage untouched.
    Ignore,
    /// Remember this position for resuming.
    Save { position_ms: u64 },
    /// Watched to the end: mark completed, no resume.
    Completed,
    /// Too close to the start: forget any resume point.
    Reset,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedProgress {
    pub position_ms: u64,
    pub duration_ms: Option<u64>,
    pub completed: bool,
}

impl ResumePolicy {
    pub fn evaluate(&self, position_ms: u64, duration_ms: Option<u64>) -> ProgressDecision {
        let Some(duration) = duration_ms.filter(|d| *d >= self.min_duration_ms) else {
            return ProgressDecision::Ignore;
        };
        let position = position_ms.min(duration);
        let remaining = duration - position;
        if position as f64 >= duration as f64 * self.completed_ratio
            || remaining <= self.completed_tail_ms
        {
            ProgressDecision::Completed
        } else if position < self.min_position_ms {
            ProgressDecision::Reset
        } else {
            ProgressDecision::Save {
                position_ms: position,
            }
        }
    }

    /// Converts a decision into the record to store (None = store nothing).
    pub fn record(
        &self,
        decision: ProgressDecision,
        duration_ms: Option<u64>,
    ) -> Option<SavedProgress> {
        match decision {
            ProgressDecision::Ignore => None,
            ProgressDecision::Save { position_ms } => Some(SavedProgress {
                position_ms,
                duration_ms,
                completed: false,
            }),
            ProgressDecision::Completed => Some(SavedProgress {
                position_ms: 0,
                duration_ms,
                completed: true,
            }),
            ProgressDecision::Reset => Some(SavedProgress {
                position_ms: 0,
                duration_ms,
                completed: false,
            }),
        }
    }

    /// Where to start a file given what was saved. `None` = from the beginning.
    pub fn resume_from(&self, saved: &SavedProgress) -> Option<u64> {
        if saved.completed || saved.position_ms < self.min_position_ms {
            return None;
        }
        // Re-check against the saved duration in case the policy changed.
        if let ProgressDecision::Save { .. } = self.evaluate(saved.position_ms, saved.duration_ms) {
            Some(saved.position_ms.saturating_sub(self.rewind_ms))
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ProgressDecision::*;

    const MIN: u64 = 60_000;

    #[test]
    fn short_or_unknown_media_is_ignored() {
        let p = ResumePolicy::default();
        assert_eq!(p.evaluate(20_000, Some(30_000)), Ignore);
        assert_eq!(p.evaluate(20_000, None), Ignore);
        assert_eq!(
            p.evaluate(20_000, Some(MIN)),
            Save {
                position_ms: 20_000
            }
        );
    }

    #[test]
    fn start_middle_end() {
        let p = ResumePolicy::default();
        let d = Some(3_600_000);
        assert_eq!(p.evaluate(4_999, d), Reset);
        assert_eq!(p.evaluate(5_000, d), Save { position_ms: 5_000 });
        assert_eq!(
            p.evaluate(1_800_000, d),
            Save {
                position_ms: 1_800_000
            }
        );
        assert_eq!(p.evaluate(3_420_000, d), Completed, "95%");
        assert_eq!(
            p.evaluate(9_999_999, d),
            Completed,
            "past the end is clamped"
        );
    }

    #[test]
    fn short_media_completes_within_tail() {
        let p = ResumePolicy::default();
        // 90 s file: 95% is 85.5 s, but the 10 s tail makes 80 s completed.
        assert_eq!(
            p.evaluate(79_999, Some(90_000)),
            Save {
                position_ms: 79_999
            }
        );
        assert_eq!(p.evaluate(80_000, Some(90_000)), Completed);
    }

    #[test]
    fn resume_rewinds_and_respects_completion() {
        let p = ResumePolicy::default();
        let saved = SavedProgress {
            position_ms: 600_000,
            duration_ms: Some(3_600_000),
            completed: false,
        };
        assert_eq!(p.resume_from(&saved), Some(598_000));
        let done = SavedProgress {
            completed: true,
            ..saved
        };
        assert_eq!(p.resume_from(&done), None);
        let early = SavedProgress {
            position_ms: 1_000,
            ..saved
        };
        assert_eq!(p.resume_from(&early), None);
        let short = SavedProgress {
            duration_ms: Some(30_000),
            position_ms: 20_000,
            completed: false,
        };
        assert_eq!(p.resume_from(&short), None);
    }

    #[test]
    fn records_map_decisions() {
        let p = ResumePolicy::default();
        let d = Some(MIN * 2);
        assert_eq!(p.record(Ignore, d), None);
        assert_eq!(
            p.record(Completed, d),
            Some(SavedProgress {
                position_ms: 0,
                duration_ms: d,
                completed: true
            })
        );
        assert_eq!(
            p.record(Reset, d),
            Some(SavedProgress {
                position_ms: 0,
                duration_ms: d,
                completed: false
            })
        );
        assert_eq!(
            p.record(Save { position_ms: 9_000 }, d),
            Some(SavedProgress {
                position_ms: 9_000,
                duration_ms: d,
                completed: false
            })
        );
    }
}
