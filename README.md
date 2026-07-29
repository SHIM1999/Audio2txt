# Audio2txt

A local web app for turning Korean audio files into timestamped text.

## What It Does

- Upload M4A, MP3, WAV, MP4, AAC, or other browser-supported audio files.
- Transcribe locally with `faster-whisper` on CPU or NVIDIA CUDA GPU.
- Edit timestamped transcript lines in the browser.
- Copy the corrected transcript.
- Export the corrected transcript as `.txt` or `.docx`.

## Requirements

- Node.js
- Python 3.12 on Windows, or Python 3 on macOS/Linux
- Python package from `requirements.txt`

Install the Python dependency:

```bash
py -3.12 -m pip install -r requirements.txt
```

On macOS/Linux:

```bash
python3 -m pip install -r requirements.txt
```

## Run In Development

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

The API runs at `http://localhost:3001`.

## Easy Windows Start

For a fresh downloaded copy:

```bat
install-windows.bat
start-windows.bat
```

Then open:

```text
http://localhost:3001
```

## Production Build

```bash
npm run build
npm run server
```

Then open `http://localhost:3001`.

## Update With Git

When this project is published to GitHub, install it once with:

```bash
git clone <repo-url>
cd Audio2txt
install-windows.bat
```

After that, update it with:

```bat
update-windows.bat
```

That script runs `git pull`, updates Node dependencies, and rebuilds the frontend.

## Create A Download ZIP

From the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-windows.ps1
```

The ZIP is written to:

```text
packages/audio2txt-v0.1.5-source.zip
```

The package intentionally excludes `node_modules`, `dist`, `.venv`, cache folders,
and uploaded audio files.

## Create A Portable Windows ZIP

This creates a larger package with a Windows launcher executable for the Node
server and a bundled Python transcriber executable:

```powershell
npm run package:portable
```

The ZIP is written to:

```text
packages/audio2txt-v0.1.5-windows-portable.zip
```

Inside the portable folder users can run:

```text
Audio2txt.bat
```

The first transcription may still download Whisper model files. Use Tiny or Base
for quick checks; Medium gives better quality but can take several minutes on
CPU and during first model download.

Portable users update by downloading the newest ZIP from GitHub Releases. They
do not need Git, Node.js, Python, or `update-windows.bat`.

## Electron Product Branch

The `electron-product` branch wraps the same React UI and local transcription
API in an Electron desktop shell. It packages app code into ASAR and copies the
Python `transcribe-runtime` folder as executable resources.

```powershell
npm run electron
npm run build:electron
```

The desktop build writes an unpacked Windows app to
`desktop-release-packager\Audio2txt-win32-x64` and installer/update artifacts to
`desktop-release-installer`:

The app icon is tracked in `build\icon.ico` and `build\icon.png`.

```text
Audio2txt-Setup-0.1.5.exe
Audio2txt-Setup-0.1.5.msi
audio2txt-0.1.5-full.nupkg
RELEASES
```

The `.nupkg` and `RELEASES` files are the Squirrel.Windows update feed pieces.

## Configuration

By default, the backend runs Python with `py -3.12` on Windows and `python3` elsewhere.
The app's Engine setting defaults to Auto, which uses CUDA when CTranslate2 can see an NVIDIA GPU and falls back to CPU otherwise.

Set `PYTHON_BIN` if you need a different executable:

```bash
set PYTHON_BIN=C:\Path\To\python.exe
npm run server
```
