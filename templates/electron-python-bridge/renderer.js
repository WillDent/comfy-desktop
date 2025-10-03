const button = document.getElementById('invoke');
const output = document.getElementById('output');

async function askPython() {
  button.disabled = true;
  output.textContent = 'Waiting for Python response...';

  try {
    const result = await window.pythonBridge.invoke('How is the weather today?');
    output.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    output.textContent = `Error: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

button.addEventListener('click', askPython);
