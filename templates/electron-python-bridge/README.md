# Electron + Python Bridge Template

This template demonstrates a minimal Electron application that embeds a long-running Python process and communicates with it over standard input/output. It is designed to be a clear starting point for projects that want to pair a JavaScript UI with Python-based AI/ML workloads.

## Project Structure

```
templates/electron-python-bridge/
├── main.js             # Electron main process. Spawns Python and bridges IPC to the renderer.
├── preload.js          # Exposes a safe API for the renderer to call into the main process.
├── renderer.js         # Minimal renderer script that triggers Python work and displays results.
├── index.html          # Simple UI with a button for invoking Python.
├── package.json        # Node dependencies (only Electron for this template).
└── python/
    ├── backend.py      # Python worker that responds to JSON messages over stdin/stdout.
    └── requirements.txt# Python dependencies for packaging or runtime environments.
```

## Quick Start

1. **Install Node dependencies**

   ```bash
   cd templates/electron-python-bridge
   npm install
   ```

   > **Tip:** Replace `npm` with `yarn` or `pnpm` if those are your preferred package managers.

2. **Create a Python virtual environment (optional but recommended)**

   ```bash
   cd python
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
   pip install -r requirements.txt
   ```

3. **Run the template**

   ```bash
   cd ..
   npm start
   ```

   Electron will spawn the Python backend automatically. Use the "Ask Python" button in the renderer window to send a JSON message to the Python process and display the response.

## How It Works

- The Electron **main process** starts a persistent Python worker using `child_process.spawn`.
- The Python worker expects JSON messages on `stdin` and replies with JSON on `stdout`. Each message includes an `id` so that responses can be matched to requests.
- The main process exposes an IPC handler (`python:invoke`) that the renderer calls through the `contextBridge` API.
- The renderer requests a simple AI-like computation (a mock sentiment analysis) and displays the Python response.

This pattern keeps Python logic isolated while giving the Electron UI synchronous-like access to asynchronous Python work.

## Extending the Template

- Replace the placeholder sentiment analysis with calls into your ML or data-processing code.
- Add model download/caching logic to `python/backend.py` and adjust the Electron startup sequence to show progress.
- Swap out the JSON-over-stdio bridge for a local HTTP server, WebSockets, or gRPC if you need more complex messaging.
- Use packaging tools such as `PyInstaller`, `Briefcase`, or `conda-pack` to bundle Python when you produce production builds.

## Packaging Notes

- The template keeps dependencies explicit through `requirements.txt` for Python and `package.json` for Node/Electron.
- For production, you can freeze the Python environment or vendor the interpreter inside your Electron app bundle. Tools like [electron-builder](https://www.electron.build/) or [Todesktop](https://www.todesktop.com/) can copy the Python runtime into the final installers.
- Make sure to update the `PYTHON` environment variable or modify `main.js` if you relocate the interpreter for packaged builds.

## Next Steps

Use this folder as a starting point when you need to:

- Prototype Electron apps that run Python code locally without requiring users to install Python manually.
- Experiment with AI model inference locally before investing in full packaging automation.
- Share a concise reproducible example with teammates to illustrate the Electron ↔ Python integration pattern.

