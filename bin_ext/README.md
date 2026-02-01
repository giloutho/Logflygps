# GPSDump Binaries

This folder should contain the GPSDump executables for different operating systems:

- `GpsDump542.exe` - Windows
- `gpsdumpMac64_14` - macOS (64-bit)
- `gpsdumpLin64_28` - Linux (64-bit)

These files are required for serial GPS communication (Flymaster, Flytec, etc.).

## Source

The GPSDump binaries can be copied from:
- logfly65/bin_ext/

Make sure to preserve executable permissions on macOS and Linux:
```bash
chmod +x gpsdumpMac64_14
chmod +x gpsdumpLin64_28
```
