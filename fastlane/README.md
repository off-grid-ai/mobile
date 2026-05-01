# Fastlane metadata

This folder follows the [Fastlane Supply](https://docs.fastlane.tools/actions/supply/) structure used by F-Droid and IzzyOnDroid for app metadata. Edit these files to update store listings without going through manual review.

```
fastlane/metadata/android/en-US/
├── title.txt                    Short app name (max 50 chars)
├── short_description.txt        One-liner (max 80 chars)
├── full_description.txt         Long description (~4000 chars)
├── changelogs/
│   └── <versionCode>.txt        Release notes per version (max 500 chars)
└── images/
    ├── icon.png                 512×512 app icon (TODO: add)
    ├── featureGraphic.png       1024×500 (TODO: add)
    └── phoneScreenshots/
        ├── 1.png                (TODO: add)
        ├── 2.png
        └── ...                  Up to 8 screenshots, 320–3840 px
```

## TODO

- [ ] Add `images/icon.png` (512×512)
- [ ] Add `images/featureGraphic.png` (1024×500)
- [ ] Add 4-8 phone screenshots in `images/phoneScreenshots/`
- [ ] Add localized variants (e.g. `metadata/android/de-DE/`) if/when translations land
