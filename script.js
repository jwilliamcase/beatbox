/** Create AudioContext */
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

/** We'll store decoded AudioBuffers here */
const audioBuffers = {};

/** All sample file paths */
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

/** Simple object to track volume & pitch for each instrument */
const sampleSettings = {};
for (let key in sampleFiles) {
    sampleSettings[key] = { volume: 1, pitch: 1 };
}

/** A global object to store per-step volumes for each instrument,
 * 16 steps each, default to 0 (off). 
 */
const stepVolumes = {};
Object.keys(sampleFiles).forEach(instrument => {
    stepVolumes[instrument] = new Array(16).fill(0);
});

/** Load all samples into audioBuffers */
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
const lookahead = 25;          // ms (how often to run scheduler)

// DOM references
const padGroups = document.querySelectorAll('.pad-group');
const sequencerSteps = document.querySelectorAll('.sequencer-step');
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const tempoInput = document.getElementById('tempo');
const tempoValue = document.getElementById('tempoValue');
const tempoDisplay = document.getElementById('tempoDisplay');

// -------------- Functions -------------- //

/** scheduleSound: schedule a sound at a given time with a finalVolume 
 *  derived from instrument volume * stepVolume 
 */
function scheduleSound(sound, time, stepVol = 1) {
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffers[sound];
    source.playbackRate.value = sampleSettings[sound].pitch;

    const gainNode = audioContext.createGain();
    const finalVolume = sampleSettings[sound].volume * stepVol;
    gainNode.gain.value = finalVolume;

    source.connect(gainNode).connect(audioContext.destination);
    source.start(time);
}

/** scheduleStep: for each step matching stepIndex, 
 *  if stepVolume > 0, schedule a note 
 */
function scheduleStep(stepIndex, time) {
    sequencerSteps.forEach(step => {
        if (parseInt(step.dataset.step) === stepIndex) {
            const sound = step.parentElement.dataset.sound;
            const vol = stepVolumes[sound][stepIndex];
            if (vol > 0) {
                scheduleSound(sound, time, vol);
            }
        }
    });
}

/** updateStepVisualization: highlight the current step in the UI */
function updateStepVisualization(step) {
    // remove existing .current classes
    document.querySelectorAll('.sequencer-step, .step-number')
        .forEach(el => el.classList.remove('current'));

    // highlight elements matching data-step=step
    document.querySelectorAll(`[data-step="${step}"]`)
        .forEach(el => el.classList.add('current'));

    // highlight the top row step number
    const stepNumber = document.querySelector(`.step-number:nth-child(${step + 1})`);
    if (stepNumber) stepNumber.classList.add('current');
}

/** scheduler: schedule as many notes as we can within scheduleAheadTime */
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

/** startSequencer: begin scheduling from step 0 */
function startSequencer() {
    if (!isPlaying) {
        isPlaying = true;
        currentStep = 0;
        nextNoteTime = audioContext.currentTime;
        scheduler();
    }
}

/** stopSequencer: stop scheduling and clear highlights */
function stopSequencer() {
    isPlaying = false;
    clearTimeout(timerID);
    currentStep = 0;
    updateStepVisualization(-1); // clear highlight
}

/** A helper to color the step cell from black (volume=0) to bright orange (volume=1). */
function updateStepColor(step, volume) {
    // We'll do a linear blend from #000000 (black) to #ff8c00 (orange).
    const r0 = 0,   g0 = 0,   b0 = 0;      // black
    const r1 = 255, g1 = 140, b1 = 0;      // #ff8c00
    const r = r0 + (r1 - r0) * volume;
    const g = g0 + (g1 - g0) * volume;
    const b = b0 + (b1 - b0) * volume;
    step.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
}

/** randomizeRow: randomize step volumes for a single instrument */
function randomizeRow(sound) {
    const steps = document.querySelectorAll(`.sequencer-row[data-sound="${sound}"] .sequencer-step`);
    steps.forEach((step, idx) => {
        const isActive = Math.random() > 0.8; // 20% chance
        if (isActive) {
            // random volume between 0.1 and 1.0
            const vol = 0.1 + Math.random() * 0.9;
            stepVolumes[sound][idx] = vol;
            step.classList.add('active');
            updateStepColor(step, vol);
        } else {
            stepVolumes[sound][idx] = 0;
            step.classList.remove('active');
            updateStepColor(step, 0);
        }
    });
}

/** loadSamples, then enable UI */
loadSamples().then(() => {
    console.log('All samples loaded!');
}).catch(err => {
    console.error('Error loading samples:', err);
});

// -------------- Event Listeners -------------- //

// 1) Instrument PAD PREVIEW (click) => triggers the instrument
padGroups.forEach(group => {
    const sound = group.dataset.sound;
    const drumPad = group.querySelector('.drum-pad');
    const volumeKnob = group.querySelector('.volume-knob');
    const pitchKnob = group.querySelector('.pitch-knob');

    // Clicking the pad triggers a one-shot preview
    drumPad.addEventListener('click', () => {
        // play this instrument
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffers[sound];
        source.playbackRate.value = sampleSettings[sound].pitch;
        const gainNode = audioContext.createGain();
        gainNode.gain.value = sampleSettings[sound].volume;
        source.connect(gainNode).connect(audioContext.destination);
        source.start(audioContext.currentTime);

        // quick visual feedback
        drumPad.classList.add('active');
        setTimeout(() => drumPad.classList.remove('active'), 200);
    });

    // Volume knob => sets instrument-level volume
    volumeKnob.addEventListener('input', () => {
        sampleSettings[sound].volume = volumeKnob.value;
    });

    // Pitch knob => sets instrument-level pitch
    pitchKnob.addEventListener('input', () => {
        sampleSettings[sound].pitch = pitchKnob.value;
    });
});

// 2) Step Click => toggle 0 or 0.8 for that step's volume
sequencerSteps.forEach(step => {
    step.addEventListener('click', () => {
        const sound = step.parentElement.dataset.sound;
        const stepIndex = parseInt(step.dataset.step);
        if (stepVolumes[sound][stepIndex] === 0) {
            stepVolumes[sound][stepIndex] = 0.8;
            step.classList.add('active');
            updateStepColor(step, 0.8);
        } else {
            stepVolumes[sound][stepIndex] = 0;
            step.classList.remove('active');
            updateStepColor(step, 0);
        }
    });
});

// 3) Drag logic for volume on each step
let dragStep = null;
let dragStartY = 0;
let dragStartVol = 0;
const volumeScale = 0.005; // volume units per px drag

// MOUSE
sequencerSteps.forEach(step => {
    step.addEventListener('mousedown', e => {
        e.preventDefault();
        dragStep = step;
        dragStartY = e.clientY;
        const sound = dragStep.parentElement.dataset.sound;
        const stepIndex = parseInt(dragStep.dataset.step);
        dragStartVol = stepVolumes[sound][stepIndex];
        document.body.style.userSelect = 'none';
    });
});

document.addEventListener('mousemove', e => {
    if (!dragStep) return;
    const sound = dragStep.parentElement.dataset.sound;
    const stepIndex = parseInt(dragStep.dataset.step);

    const deltaY = dragStartY - e.clientY; // dragging up => positive delta
    let newVol = dragStartVol + deltaY * volumeScale;
    newVol = Math.min(1, Math.max(0, newVol));
    stepVolumes[sound][stepIndex] = newVol;

    if (newVol > 0) dragStep.classList.add('active');
    else dragStep.classList.remove('active');

    updateStepColor(dragStep, newVol);
});

document.addEventListener('mouseup', () => {
    dragStep = null;
    document.body.style.userSelect = '';
});

// TOUCH
sequencerSteps.forEach(step => {
    step.addEventListener('touchstart', e => {
        dragStep = step;
        dragStartY = e.touches[0].clientY;
        const sound = dragStep.parentElement.dataset.sound;
        const stepIndex = parseInt(dragStep.dataset.step);
        dragStartVol = stepVolumes[sound][stepIndex];
        document.body.style.userSelect = 'none';
    });
});

document.addEventListener('touchmove', e => {
    if (!dragStep) return;
    const sound = dragStep.parentElement.dataset.sound;
    const stepIndex = parseInt(dragStep.dataset.step);

    const deltaY = dragStartY - e.touches[0].clientY;
    let newVol = dragStartVol + deltaY * volumeScale;
    newVol = Math.min(1, Math.max(0, newVol));
    stepVolumes[sound][stepIndex] = newVol;

    if (newVol > 0) dragStep.classList.add('active');
    else dragStep.classList.remove('active');

    updateStepColor(dragStep, newVol);
    e.preventDefault();
});

document.addEventListener('touchend', () => {
    dragStep = null;
    document.body.style.userSelect = '';
});

// 4) Start / Stop
startButton.addEventListener('click', startSequencer);
stopButton.addEventListener('click', stopSequencer);

// 5) Reset / Random
document.getElementById('reset').addEventListener('click', () => {
    sequencerSteps.forEach(step => {
        step.classList.remove('active');
        const sound = step.parentElement.dataset.sound;
        const stepIndex = parseInt(step.dataset.step);
        stepVolumes[sound][stepIndex] = 0;
        updateStepColor(step, 0);
    });
});
document.getElementById('randomize').addEventListener('click', () => {
    Object.keys(sampleFiles).forEach(sound => randomizeRow(sound));
});

// 6) Tempo drag
let isDraggingTempo = false;
let startTempo = 0;
let startY = 0;

tempoDisplay.addEventListener('mousedown', (e) => {
    isDraggingTempo = true;
    startY = e.clientY;
    startTempo = tempo;
    document.body.style.userSelect = 'none';
    e.preventDefault();
});
document.addEventListener('mousemove', (e) => {
    if (!isDraggingTempo) return;
    const deltaY = startY - e.clientY;
    const newTempo = Math.min(240, Math.max(60, startTempo + deltaY));
    if (newTempo !== tempo) {
        tempo = newTempo;
        tempoDisplay.textContent = tempo;
        if (isPlaying) {
            stopSequencer();
            startSequencer();
        }
    }
});
document.addEventListener('mouseup', () => {
    isDraggingTempo = false;
    document.body.style.userSelect = '';
});

// Touch-based tempo
tempoDisplay.addEventListener('touchstart', (e) => {
    isDraggingTempo = true;
    startY = e.touches[0].clientY;
    startTempo = tempo;
    document.body.style.userSelect = 'none';
    e.preventDefault();
});
document.addEventListener('touchmove', (e) => {
    if (!isDraggingTempo) return;
    const deltaY = startY - e.touches[0].clientY;
    const newTempo = Math.min(240, Math.max(60, startTempo + deltaY));
    if (newTempo !== tempo) {
        tempo = newTempo;
        tempoDisplay.textContent = tempo;
        if (isPlaying) {
            stopSequencer();
            startSequencer();
        }
    }
    e.preventDefault();
});
document.addEventListener('touchend', () => {
    isDraggingTempo = false;
    document.body.style.userSelect = '';
});

/** Optional spacebar toggles play/stop */
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        isPlaying ? stopSequencer() : startSequencer();
    }
});

// 7) On first user click/touch, resume audio context on mobile
document.addEventListener('click', () => {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}, { once: true });
document.addEventListener('touchstart', () => {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}, { once: true });
