// Simple image upload -> websim + AI modify flow
// Assumes window.websim is available.

const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const generateBtn = document.getElementById('generateBtn');
const generateBaseBtn = document.getElementById('generateBaseBtn');
const promptInput = document.getElementById('promptInput');
const status = document.getElementById('status');
const originalImg = document.getElementById('originalImg');
const modifiedImg = document.getElementById('modifiedImg');
const originalUrl = document.getElementById('originalUrl');
const modifiedUrl = document.getElementById('modifiedUrl');
const saveModifiedBtn = document.getElementById('saveModifiedBtn');

let uploadedUrl = null;
let generatedUrl = null;
let lastUploadRecord = null;
// new variable to hold an image pasted from clipboard
let pastedFile = null;

function setStatus(text){
  status.textContent = text;
}

fileInput.addEventListener('change', () => {
  const f = fileInput.files && fileInput.files[0];
  // clear any previous pasted file when a real file is chosen
  pastedFile = null;
  if (!f) return;
  originalImg.src = URL.createObjectURL(f);
  uploadedUrl = null;
  generatedUrl = null;
  originalUrl.textContent = '';
  modifiedUrl.textContent = '';
  generateBtn.disabled = true;
  saveModifiedBtn.disabled = true;
  setStatus('File selected. Upload to Websim to enable AI generation.');
});

// Paste handler: support Ctrl+V or right-click paste of images
window.addEventListener('paste', async (e) => {
  try {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith('image')) {
        const blob = item.getAsFile ? item.getAsFile() : item;
        if (!blob) continue;
        // store as pastedFile so upload uses it
        pastedFile = new File([blob], `pasted-image-${Date.now()}.png`, { type: blob.type });
        // show preview
        originalImg.src = URL.createObjectURL(pastedFile);
        uploadedUrl = null;
        generatedUrl = null;
        originalUrl.textContent = '';
        modifiedUrl.textContent = '';
        generateBtn.disabled = true;
        saveModifiedBtn.disabled = true;
        setStatus('Image pasted. Upload to Websim to enable AI generation.');
        // prevent default so some browsers don't also try to insert the image into focused element
        e.preventDefault();
        break;
      }
      // Also support file items (e.g., copy from Finder)
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && file.type.startsWith('image')) {
          pastedFile = new File([file], file.name, { type: file.type });
          originalImg.src = URL.createObjectURL(pastedFile);
          uploadedUrl = null;
          generatedUrl = null;
          originalUrl.textContent = '';
          modifiedUrl.textContent = '';
          generateBtn.disabled = true;
          saveModifiedBtn.disabled = true;
          setStatus('Image pasted. Upload to Websim to enable AI generation.');
          e.preventDefault();
          break;
        }
      }
    }
  } catch (err) {
    console.error('Paste handling error', err);
  }
});

uploadBtn.addEventListener('click', async () => {
  // use selected file or pastedFile if present
  const f = (fileInput.files && fileInput.files[0]) || pastedFile;
  if (!f) {
    setStatus('No file selected or pasted.');
    return;
  }
  try {
    setStatus('Uploading to storage...');
    uploadBtn.disabled = true;
    const url = await websim.upload(f);
    uploadedUrl = url;
    originalUrl.textContent = url;
    setStatus('Saving record...');
    // create a persistent record linking to the uploaded file
    lastUploadRecord = await room.collection('image_v1').create({
      file_url: url,
      filename: f.name,
      prompt: null
    });
    setStatus('Upload saved. Ready to generate.');
    generateBtn.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus('Upload failed: ' + (err.message || err));
  } finally {
    uploadBtn.disabled = false;
  }
});

// New: generate a base image using "FreeFlux Schnell"
generateBaseBtn.addEventListener('click', async () => {
  const userPrompt = (promptInput.value || 'free flux schnell').trim();
  const basePrompt = `${userPrompt} — generate a clear, playful image`;
  try {
    setStatus('Generating base image (FreeFlux Schnell, ~10s)...');
    generateBaseBtn.disabled = true;
    // call websim.imageGen to simulate FreeFlux Schnell generator
    const result = await websim.imageGen({
      prompt: basePrompt,
      // you could add width/height or other options here
    });
    // treat the generated base as the "uploaded" source for later modification
    uploadedUrl = result.url;
    originalImg.src = uploadedUrl;
    originalUrl.textContent = uploadedUrl;
    // save a record for the base generation
    lastUploadRecord = await room.collection('image_v1').create({
      file_url: uploadedUrl,
      filename: 'base-generated.png',
      prompt: userPrompt
    });
    setStatus('Base image generated and saved. Now click "Generate Modified Image" to apply nano banana.');
    generateBtn.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus('Base generation failed: ' + (err.message || err));
  } finally {
    generateBaseBtn.disabled = false;
  }
});

generateBtn.addEventListener('click', async () => {
  if (!uploadedUrl) {
    setStatus('Upload or generate a base image first.');
    return;
  }
  // Internal operation name (do not append to user-visible prompt)
  const operationName = 'nano banana';
  // Use user's prompt if provided, otherwise use a neutral default for the AI request
  const userPrompt = (promptInput.value || '').trim();
  const aiPrompt = userPrompt || 'Modify this image in a playful, clear way while keeping the subject visible.';

  try {
    setStatus('Generating modified image (nano banana, ~10s)...');
    generateBtn.disabled = true;

    // If the uploadedUrl is already a data url we can pass it through; otherwise fetch and convert
    const dataUrl = await urlToDataUrl(uploadedUrl);
    const result = await websim.imageGen({
      // Use the aiPrompt (no "nano banana" appended)
      prompt: aiPrompt,
      image_inputs: [{ url: dataUrl }],
    });

    generatedUrl = result.url;
    modifiedImg.src = generatedUrl;
    modifiedUrl.textContent = generatedUrl;
    setStatus('Generated. You can save the modified image record.');
    saveModifiedBtn.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus('Generation failed: ' + (err.message || err));
  } finally {
    generateBtn.disabled = false;
  }
});

saveModifiedBtn.addEventListener('click', async () => {
  if (!generatedUrl) {
    setStatus('No generated image to save.');
    return;
  }
  try {
    setStatus('Saving modified image record...');
    saveModifiedBtn.disabled = true;
    const rec = await room.collection('image_modified_v1').create({
      original_record_id: lastUploadRecord ? lastUploadRecord.id : null,
      original_url: uploadedUrl,
      modified_url: generatedUrl,
      // store the user's prompt (or a neutral label) separately from the operation name
      prompt: (promptInput.value || 'Modified image (no prompt provided)'),
      operation: 'nano banana'
    });
    setStatus('Saved modified image record: ' + rec.id);
  } catch (err) {
    console.error(err);
    setStatus('Save failed: ' + (err.message || err));
  } finally {
    saveModifiedBtn.disabled = false;
  }
});

// Helper: fetch a remote url and convert to data URL (base64) for image_inputs
async function urlToDataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Ensure Websim room is available globally (per docs)
let room;
(async function initRoom(){
  if (!window.websim) {
    setStatus('Error: websim not available on window.');
    return;
  }
  // create the room instance at global scope per docs
  room = new WebsimSocket();
  setStatus('Ready. Select an image to start.');
})();