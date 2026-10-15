use std::path::{Path, PathBuf};

/// A validated media source. M0 accepts local files only; network URLs are
/// rejected until their security and privacy behavior is scoped.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MediaSource {
    LocalFile(PathBuf),
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum MediaSourceError {
    #[error("path is empty")]
    Empty,
    #[error("path must be absolute")]
    NotAbsolute,
    #[error("only local files are supported")]
    UnsupportedScheme,
    #[error("file does not exist or is not accessible")]
    NotFound,
    #[error("path is not a regular file")]
    NotAFile,
}

impl MediaSource {
    /// Validates a user-supplied path. Touches the filesystem (metadata only).
    pub fn from_user_path(input: &str) -> Result<Self, MediaSourceError> {
        let trimmed = input.trim();
        if trimmed.is_empty() {
            return Err(MediaSourceError::Empty);
        }
        if trimmed.contains("://") || trimmed.contains('\0') {
            return Err(MediaSourceError::UnsupportedScheme);
        }
        let path = Path::new(trimmed);
        if !path.is_absolute() {
            return Err(MediaSourceError::NotAbsolute);
        }
        let meta = std::fs::metadata(path).map_err(|_| MediaSourceError::NotFound)?;
        if !meta.is_file() {
            return Err(MediaSourceError::NotAFile);
        }
        Ok(Self::LocalFile(path.to_path_buf()))
    }

    pub fn path(&self) -> &Path {
        match self {
            Self::LocalFile(p) => p,
        }
    }

    pub fn display_name(&self) -> String {
        self.path()
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_relative_and_urls() {
        assert_eq!(
            MediaSource::from_user_path("  "),
            Err(MediaSourceError::Empty)
        );
        assert_eq!(
            MediaSource::from_user_path("video.mp4"),
            Err(MediaSourceError::NotAbsolute)
        );
        assert_eq!(
            MediaSource::from_user_path("https://example.com/a.mp4"),
            Err(MediaSourceError::UnsupportedScheme)
        );
        assert_eq!(
            MediaSource::from_user_path("file:///C:/a.mp4"),
            Err(MediaSourceError::UnsupportedScheme)
        );
    }

    #[test]
    fn rejects_missing_and_directories() {
        let dir = std::env::temp_dir();
        assert_eq!(
            MediaSource::from_user_path(dir.to_str().unwrap()),
            Err(MediaSourceError::NotAFile)
        );
        let missing = dir.join("nova-definitely-missing-file.mp4");
        assert_eq!(
            MediaSource::from_user_path(missing.to_str().unwrap()),
            Err(MediaSourceError::NotFound)
        );
    }

    #[test]
    fn accepts_existing_file() {
        let file = std::env::temp_dir().join("nova-media-source-test.bin");
        std::fs::write(&file, b"x").unwrap();
        let src = MediaSource::from_user_path(file.to_str().unwrap()).unwrap();
        assert_eq!(src.display_name(), "nova-media-source-test.bin");
        std::fs::remove_file(file).ok();
    }
}
