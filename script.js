// Create AudioContext
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// We'll store decoded AudioBuffers here
const audioBuffers = {};

// All sample file paths
const sampleFiles = {
    kick:    'kick.wav',
    snare:   'snare.wav',
    hihat:   'hihat.wav',
    tom:     'tom.wav',
    clap:    'clap.wav',
    rim:     'rim.wav',
    cowbell: 'cowbell.wav',
    ride:    'ride.wav'
};

// Simple object to track volume & pitch for each instrument
const sampleSettings = {};
for (let key in sampleFiles) {
    sampleSettings[key] = { volume: 1, pitch: 1 };
}

// Load all samples into audioBuffers
async function loadSamples() {
    const promises = Object.keys(sampleFiles).map(async (key) => {
        const response = await fetch(sampleFiles[key]);
        const arrayBuf = await response.arrayBuffer();
        audioBuffers[key] = await audioContext.decodeAudioData(arrayBuf);
    });
    // Wait until all are loaded
    await Promise.all(promises);
}

// Scheduling variables
let isPlaying = false;
let currentStep = 0;
let nextNoteTime = 0;
let timerID = null;
let tempo = 90;

// For look-ahead scheduling
const scheduleAheadTime = 0.1; // how many seconds ahead to schedule
const lookahead = 25;         // ms (how often to run scheduler)

// DOM elements
const padGroups = document.querySelectorAll('.pad-group');
const sequencerSteps = document.querySelectorAll('.sequencer-step');
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const tempoInput = document.getElementById('tempo');
const tempoValue = document.getElementById('tempoValue');

// Function to randomize a specific sequencer row
function randomizeRow(sound) {
    const steps = document.querySelectorAll(`.sequencer-row[data-sound="${sound}"] .sequencer-step`);
    steps.forEach(step => {
        step.classList.toggle('active', Math.random() > 0.8); // 20% chance to activate a step
    });
}

// Add event listeners to all dice buttons
document.querySelectorAll('.dice-button').forEach((button, index) => {
    const sounds = ['kick', 'snare', 'hihat', 'tom', 'clap', 'rim', 'cowbell', 'ride'];
    const sound = sounds[index]; // Match the button index to the sound
    button.addEventListener('click', (e) => {
        e.stopPropagation(); // Stop the event from bubbling up
        randomizeRow(sound);
    });
});

// Load everything, then enable the UI
loadSamples().then(() => {
    console.log('All samples loaded!');
}).catch(err => {
    console.error('Error loading samples:', err);
});

// Scheduler: schedule as many notes as we can within scheduleAheadTime
function scheduler() {
    while (nextNoteTime < audioContext.currentTime + scheduleAheadTime) {
        scheduleStep(currentStep, nextNoteTime);
        updateStepVisualization(currentStep);

        // Each step is a 16th note
        const secondsPerBeat = 60.0 / tempo; 
        nextNoteTime += (secondsPerBeat / 4.0); 
        currentStep = (currentStep + 1) % 16;
    }
    timerID = setTimeout(scheduler, lookahead);
}

// Schedule each active step at the given time
function scheduleStep(stepIndex, time) {
    // For each row's step matching stepIndex, if it's active, schedule a note
    sequencerSteps.forEach(step => {
        if (
            parseInt(step.dataset.step) === stepIndex &&
            step.classList.contains('active')
        ) {
            const sound = step.parentElement.dataset.sound;
            scheduleSound(sound, time);
        }
    });
}

// Actually schedule a sound in the future using an AudioBufferSourceNode
function scheduleSound(sound, time) {
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffers[sound];
    source.playbackRate.value = sampleSettings[sound].pitch;

    const gainNode = audioContext.createGain();
    gainNode.gain.value = sampleSettings[sound].volume;

    source.connect(gainNode).connect(audioContext.destination);
    source.start(time);
}

// Update the "current" step visualization
function updateStepVisualization(step) {
    document.querySelectorAll('.sequencer-step, .step-number')
        .forEach(el => el.classList.remove('current'));

    // highlight all DOM elements that match the data-step
    document.querySelectorAll(`[data-step="${step}"]`)
        .forEach(el => el.classList.add('current'));

    // highlight the top row step number
    const stepNumber = document.querySelector(`.step-number:nth-child(${step + 1})`);
    if (stepNumber) stepNumber.classList.add('current');
}

// Trigger a sound immediately (for pad preview)
function triggerSound(sound) {
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffers[sound];
    source.playbackRate.value = sampleSettings[sound].pitch;

    const gainNode = audioContext.createGain();
    gainNode.gain.value = sampleSettings[sound].volume;

    source.connect(gainNode).connect(audioContext.destination);
    source.start(audioContext.currentTime);
}

// Event listeners
padGroups.forEach(group => {
    const sound = group.dataset.sound;
    const drumPad = group.querySelector('.drum-pad');
    const volumeKnob = group.querySelector('.volume-knob');
    const pitchKnob = group.querySelector('.pitch-knob');

    // Clicking the pad triggers a one-shot preview of that sound
    drumPad.addEventListener('click', () => {
        triggerSound(sound);
        // Quick visual feedback
        drumPad.classList.add('active');
        setTimeout(() => drumPad.classList.remove('active'), 200);
    });

    // Volume knob
    volumeKnob.addEventListener('input', () => {
        sampleSettings[sound].volume = volumeKnob.value;
    });

    // Pitch knob
    pitchKnob.addEventListener('input', () => {
        sampleSettings[sound].pitch = pitchKnob.value;
    });
});

// Toggle steps on sequencer click
sequencerSteps.forEach(step => {
    step.addEventListener('click', () => step.classList.toggle('active'));
});

// Mobile fix: resume audio context on first touch
document.addEventListener('click', () => {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}, { once: true });

// Also listen for first "touchstart" to resume audio context on iOS
document.addEventListener('touchstart', () => {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}, { once: true });

// Start / Stop
startButton.addEventListener('click', startSequencer);
stopButton.addEventListener('click', stopSequencer);

// Reset & Random
document.getElementById('reset').addEventListener('click', () => {
    sequencerSteps.forEach(step => step.classList.remove('active'));
});
document.getElementById('randomize').addEventListener('click', () => {
    sequencerSteps.forEach(step => {
        step.classList.toggle('active', Math.random() > 0.8);
    });
});

// Tempo drag handlers
let isDragging = false;
let startY = 0;
let startTempo = 0;
const tempoDisplay = document.getElementById('tempoDisplay');

tempoDisplay.addEventListener('mousedown', (e) => {
    isDragging = true;
    startY = e.clientY;
    startTempo = tempo;
    document.body.style.userSelect = 'none';
    e.preventDefault();
});

// Also add touch-based dragging
tempoDisplay.addEventListener('touchstart', (e) => {
    isDragging = true;
    startY = e.touches[0].clientY;
    startTempo = tempo;
    document.body.style.userSelect = 'none';
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaY = startY - e.clientY;
    const newTempo = Math.min(240, Math.max(60, startTempo + deltaY));
    
    if (newTempo !== tempo) {
        tempo = newTempo;
        tempoDisplay.textContent = tempo;
        document.getElementById('tempo').value = tempo;

        if (isPlaying) {
            stopSequencer();
            startSequencer();
        }
    }
});

document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const deltaY = startY - e.touches[0].clientY;
    const newTempo = Math.min(240, Math.max(60, startTempo + deltaY));
    
    if (newTempo !== tempo) {
        tempo = newTempo;
        tempoDisplay.textContent = tempo;
        document.getElementById('tempo').value = tempo;

        if (isPlaying) {
            stopSequencer();
            startSequencer();
        }
    }
    e.preventDefault();
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.userSelect = '';
});

document.addEventListener('touchend', () => {
    isDragging = false;
    document.body.style.userSelect = '';
});

// Optional spacebar toggle
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        isPlaying ? stopSequencer() : startSequencer();
    }
});

function startSequencer() {
    if (!isPlaying) {
        isPlaying = true;
        currentStep = 0;
        nextNoteTime = audioContext.currentTime;
        scheduler();
    }
}

function stopSequencer() {
    isPlaying = false;
    clearTimeout(timerID);
    currentStep = 0;
    // Clear "current" highlight
    updateStepVisualization(-1);
}