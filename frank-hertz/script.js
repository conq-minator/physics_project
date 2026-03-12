/**
 * Franck-Hertz Experiment Virtual Lab
 */

// Global Variables & State
let isDarkMode = false;
let chartInstance = null;
let simInterval = null;
let isSimulationRunning = false;
let electrons = [];
let atoms = [];
let currentReadout = 0.0;

// Configuration
const TABLE_ROWS = 20;
const CANVAS_WIDTH = 800; // Intrinsic width
const CANVAS_HEIGHT = 450; // Intrinsic height
const GAS_EXCITATION_POTENTIAL = 4.9; // e.g. Mercury (Hg) ~4.9V, Neon ~18.5V (using 4.9 for standard demo)

// DOM Elements
const themeToggle = document.getElementById('themeToggle');
const dataTableBody = document.querySelector('#dataTable tbody');
const plotGraphBtn = document.getElementById('plotGraphBtn');
const exampleDataBtn = document.getElementById('exampleDataBtn');
const clearDataBtn = document.getElementById('clearDataBtn');
const ctxChart = document.getElementById('resultChart').getContext('2d');

const fVoltageSlider = document.getElementById('filamentVoltage');
const aVoltageSlider = document.getElementById('accelVoltage');
const fvValDisplay = document.getElementById('fvVal');
const avValDisplay = document.getElementById('avVal');
const currentValueDisplay = document.getElementById('currentValue');
const guideBox = document.getElementById('guideBox');

const startSimBtn = document.getElementById('startSimBtn');
const pauseSimBtn = document.getElementById('pauseSimBtn');
const resetSimBtn = document.getElementById('resetSimBtn');
const recordDataBtn = document.getElementById('recordDataBtn');

const simCanvas = document.getElementById('simCanvas');
const simCtx = simCanvas.getContext('2d');
const navbar = document.querySelector('.sticky-nav');

// --- INITIALIZATION ---
function init() {
    setupTheme();
    initializeTable();
    setupEventListeners();
    initCanvas();
    initChart();
    initSmartNav();
}

// --- SMART NAVIGATION ---
function initSmartNav() {
    let lastScrollTop = 0;
    let scrollTimeout;

    window.addEventListener('scroll', () => {
        if (scrollTimeout) {
            window.cancelAnimationFrame(scrollTimeout);
        }

        scrollTimeout = window.requestAnimationFrame(() => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            // Only trigger hide logic if we've scrolled past the hero section a bit
            // and we are scrolling down
            if (scrollTop > lastScrollTop && scrollTop > 100) {
                navbar.classList.add('nav-hidden');
            } else {
                navbar.classList.remove('nav-hidden');
            }
            
            lastScrollTop = Math.max(0, scrollTop); // Keep positive
        });
    }, { passive: true }); // passive: true optimization for smooth scrolling
}

// --- THEME MANAGEMENT ---
function setupTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        setTheme('dark');
    } else {
        setTheme('light');
    }
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    isDarkMode = theme === 'dark';
    localStorage.setItem('theme', theme);
    
    document.getElementById('moon-icon').style.display = isDarkMode ? 'none' : 'block';
    document.getElementById('sun-icon').style.display = isDarkMode ? 'block' : 'none';

    if (chartInstance) {
        updateChartTheme();
    }
    
    // Request canvas redraw for theme colors
    if (!isSimulationRunning) {
        drawSimulationStatic();
    }
}

function toggleTheme() {
    setTheme(isDarkMode ? 'light' : 'dark');
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    themeToggle.addEventListener('click', toggleTheme);

    // Table buttons
    plotGraphBtn.addEventListener('click', plotGraph);
    exampleDataBtn.addEventListener('click', insertExampleData);
    clearDataBtn.addEventListener('click', clearTable);

    // Slider inputs
    fVoltageSlider.addEventListener('input', (e) => {
        fvValDisplay.textContent = parseFloat(e.target.value).toFixed(1);
        updateGuide();
    });
    
    aVoltageSlider.addEventListener('input', (e) => {
        avValDisplay.textContent = parseFloat(e.target.value).toFixed(1);
        updateLiveCurrent();
        updateGuide();
    });

    // Sim buttons
    startSimBtn.addEventListener('click', startSimulation);
    pauseSimBtn.addEventListener('click', pauseSimulation);
    resetSimBtn.addEventListener('click', resetSimulation);
    recordDataBtn.addEventListener('click', recordDataPoint);
}

// --- TABLE MANAGEMENT ---
function initializeTable() {
    dataTableBody.innerHTML = '';
    for (let i = 1; i <= TABLE_ROWS; i++) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i}</td>
            <td><input type="number" step="0.1" class="vol-input" placeholder="e.g. 5.0"></td>
            <td><input type="number" step="0.01" class="cur-input" placeholder="e.g. 0.50"></td>
        `;
        dataTableBody.appendChild(tr);
    }
}

function clearTable() {
    const inputs = dataTableBody.querySelectorAll('input');
    inputs.forEach(input => input.value = '');
    if (chartInstance) {
        chartInstance.data.labels = [];
        chartInstance.data.datasets[0].data = [];
        chartInstance.update();
    }
}

function insertExampleData() {
    const volInputs = document.querySelectorAll('.vol-input');
    const curInputs = document.querySelectorAll('.cur-input');
    
    // Typical Franck-Hertz Hg Curve data roughly peaks at 4.9, 9.8, 14.7...
    const exampleData = [
        {v: 0, c: 0}, {v: 1, c: 0.1}, {v: 2, c: 0.4}, {v: 3, c: 0.8}, {v: 4, c: 1.2},
        {v: 4.9, c: 1.5}, {v: 5.5, c: 0.4}, {v: 6.5, c: 0.8}, {v: 8, c: 1.8}, {v: 9.8, c: 3.5},
        {v: 10.5, c: 1.0}, {v: 12, c: 2.2}, {v: 13.5, c: 4.5}, {v: 14.7, c: 5.8}, {v: 15.5, c: 2.5},
        {v: 17, c: 4.8}, {v: 18.5, c: 7.5}, {v: 19.6, c: 8.5}, {v: 20.5, c: 4.0}, {v: 22, c: 6.5}
    ];

    exampleData.forEach((data, index) => {
        if (index < TABLE_ROWS) {
            volInputs[index].value = data.v;
            curInputs[index].value = data.c;
        }
    });
}

function collectTableData() {
    const volInputs = document.querySelectorAll('.vol-input');
    const curInputs = document.querySelectorAll('.cur-input');
    let dataPoints = [];

    for (let i = 0; i < TABLE_ROWS; i++) {
        const v = parseFloat(volInputs[i].value);
        const c = parseFloat(curInputs[i].value);

        if (!isNaN(v) && !isNaN(c)) {
            dataPoints.push({ x: v, y: c });
        }
    }

    // Sort by Voltage (x axis)
    dataPoints.sort((a, b) => a.x - b.x);
    return dataPoints;
}

function recordDataPoint() {
    const v = parseFloat(aVoltageSlider.value);
    const c = parseFloat(currentValueDisplay.textContent);
    
    const volInputs = document.querySelectorAll('.vol-input');
    const curInputs = document.querySelectorAll('.cur-input');
    
    for (let i = 0; i < TABLE_ROWS; i++) {
        if (volInputs[i].value === '' && curInputs[i].value === '') {
            volInputs[i].value = v;
            curInputs[i].value = c;
            return;
        }
    }
    
    alert("Observation table is full! Please clear it to record more data.");
}

// --- GRAPHING & PEAK DETECTION ---
function initChart() {
    const textColor = isDarkMode ? '#f8fafc' : '#0f172a';
    const gridColor = isDarkMode ? '#334155' : '#e2e8f0';

    chartInstance = new Chart(ctxChart, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Collector Current (µA)',
                data: [],
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#2563eb',
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4 // Smooth curve
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Accelerating Voltage (V)', color: textColor },
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                },
                y: {
                    title: { display: true, text: 'Collector Current (µA)', color: textColor },
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                }
            },
            plugins: {
                legend: { labels: { color: textColor } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Voltage: ${context.parsed.x}V, Current: ${context.parsed.y}µA`;
                        }
                    }
                }
            }
        }
    });
}

function updateChartTheme() {
    const textColor = isDarkMode ? '#f8fafc' : '#0f172a';
    const gridColor = isDarkMode ? '#334155' : '#e2e8f0';
    const primaryColor = isDarkMode ? '#3b82f6' : '#2563eb';
    const bgColor = isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(37, 99, 235, 0.1)';

    chartInstance.options.scales.x.title.color = textColor;
    chartInstance.options.scales.x.grid.color = gridColor;
    chartInstance.options.scales.x.ticks.color = textColor;
    
    chartInstance.options.scales.y.title.color = textColor;
    chartInstance.options.scales.y.grid.color = gridColor;
    chartInstance.options.scales.y.ticks.color = textColor;

    chartInstance.options.plugins.legend.labels.color = textColor;
    
    chartInstance.data.datasets[0].borderColor = primaryColor;
    chartInstance.data.datasets[0].backgroundColor = bgColor;
    chartInstance.data.datasets[0].pointBackgroundColor = primaryColor;

    chartInstance.update();
}

function plotGraph() {
    const dataPoints = collectTableData();
    if (dataPoints.length === 0) {
        alert("Please enter valid numeric data in the table to plot.");
        return;
    }

    chartInstance.data.datasets[0].data = dataPoints;
    
    // Remove previous peak annotations if any
    if (chartInstance.data.datasets.length > 1) {
        chartInstance.data.datasets.pop();
    }

    chartInstance.update();
    detectPeaks(dataPoints);
}

function detectPeaks(data) {
    if (data.length < 3) return;

    let peaks = [];
    // Simple local maximum detection
    for (let i = 1; i < data.length - 1; i++) {
        if (data[i].y > data[i-1].y && data[i].y > data[i+1].y) {
            peaks.push(data[i]);
        }
    }

    if (peaks.length > 0) {
        chartInstance.data.datasets.push({
            label: 'Detected Peaks',
            data: peaks,
            backgroundColor: '#ef4444',
            borderColor: '#ef4444',
            pointRadius: 6,
            pointHoverRadius: 8,
            pointStyle: 'triangle',
            showLine: false
        });
        chartInstance.update();
    }
}

// --- SIMULATION ---
function initCanvas() {
    simCanvas.width = CANVAS_WIDTH;
    simCanvas.height = CANVAS_HEIGHT;
    generateAtoms(40);
    drawSimulationStatic();
}

function generateAtoms(count) {
    atoms = [];
    const minX = CANVAS_WIDTH * 0.2; // Start after cathode
    const maxX = CANVAS_WIDTH * 0.8; // End before collector
    
    for (let i = 0; i < count; i++) {
        atoms.push({
            x: minX + Math.random() * (maxX - minX),
            y: 20 + Math.random() * (CANVAS_HEIGHT - 40),
            radius: 8,
            color: isDarkMode ? '#64748b' : '#94a3b8',
            flashing: 0 // Flash duration when hit
        });
    }
}

function drawSimulationStatic() {
    simCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const primaryColor = isDarkMode ? '#3b82f6' : '#2563eb';
    const textColor = isDarkMode ? '#f8fafc' : '#0f172a';
    const atomColor = isDarkMode ? '#64748b' : '#94a3b8';
    
    // Draw Cathode
    simCtx.fillStyle = '#ef4444'; // Red-ish for hot cathode
    simCtx.fillRect(40, 20, 20, CANVAS_HEIGHT - 40);
    simCtx.fillStyle = textColor;
    simCtx.font = "14px Inter";
    simCtx.fillText("Cathode", 20, 15);

    // Draw Grid (Accelerating & Retarding approx)
    simCtx.fillStyle = '#94a3b8';
    simCtx.fillRect(CANVAS_WIDTH * 0.75, 20, 5, CANVAS_HEIGHT - 40);
    simCtx.fillText("Grid", CANVAS_WIDTH * 0.75 - 10, 15);

    // Draw Collector
    simCtx.fillStyle = primaryColor;
    simCtx.fillRect(CANVAS_WIDTH - 60, 20, 20, CANVAS_HEIGHT - 40);
    simCtx.fillText("Collector", CANVAS_WIDTH - 70, 15);

    // Draw Atoms
    atoms.forEach(atom => {
        simCtx.beginPath();
        simCtx.arc(atom.x, atom.y, atom.radius, 0, Math.PI * 2);
        if (atom.flashing > 0) {
            simCtx.fillStyle = '#f59e0b'; // Flash yellow/orange
            simCtx.shadowBlur = 10;
            simCtx.shadowColor = '#f59e0b';
            atom.flashing--;
        } else {
            simCtx.fillStyle = atomColor;
            simCtx.shadowBlur = 0;
        }
        simCtx.fill();
        simCtx.shadowBlur = 0; // reset
    });

    // Draw Electrons
    simCtx.fillStyle = '#10b981'; // Green electrons
    electrons.forEach(el => {
        simCtx.beginPath();
        simCtx.arc(el.x, el.y, 3, 0, Math.PI * 2);
        simCtx.fill();
    });
}

function simulationLoop() {
    updateElements();
    drawSimulationStatic();
    if (isSimulationRunning) {
        requestAnimationFrame(simulationLoop);
    }
}

function updateElements() {
    const fVolts = parseFloat(fVoltageSlider.value);
    const aVolts = parseFloat(accelVoltage.value);
    
    // 1. Electron Emission (depends on Filament Voltage)
    if (fVolts > 0 && Math.random() < (fVolts * 0.1)) {
        electrons.push({
            x: 65,
            y: 30 + Math.random() * (CANVAS_HEIGHT - 60),
            vx: 0, // Velocity x
            energy: 0, // Kinetic energy approx in eV
            status: 'free'
        });
    }

    // 2. Electron Movement & Collision Logic
    for (let i = electrons.length - 1; i >= 0; i--) {
        let el = electrons[i];
        
        // Acceleration (depends on Accelerating Voltage)
        // Simple approx: they gain energy as they move rightwards
        let force = aVolts * 0.05; 
        el.vx += force * 0.01;
        // Cap max velocity based on full voltage
        let maxV = Math.sqrt(aVolts) * 2;
        if (el.vx > maxV) el.vx = maxV;
        
        el.x += el.vx;
        el.energy = (el.vx * el.vx) / 4; // Arbitrary scaling for demo
        
        // Calculate theoretical actual energy based on distance
        let positionRatio = (el.x - 65) / (CANVAS_WIDTH * 0.75 - 65);
        if (positionRatio > 1) positionRatio = 1;
        
        // Approximate energy gained
        let currentEv = positionRatio * aVolts;

        // Collision Check with Atoms
        if (currentEv >= GAS_EXCITATION_POTENTIAL) {
            atoms.forEach(atom => {
                if (Math.abs(el.x - atom.x) < 15 && Math.abs(el.y - atom.y) < 15) {
                    // Inelastic collision!
                    atom.flashing = 10;
                    el.vx = 0.5; // Loses almost all kinetic energy
                    // Has to rebuild energy
                }
            });
        }

        // Retarding Potential & Collection Check
        if (el.x > CANVAS_WIDTH * 0.75) {
            // Reached Grid. Must have enough energy to reach collector
            // Typically ~1.5V retarding
            if (el.vx > 1) { 
                el.x += el.vx;
            } else {
                electrons.splice(i, 1); // Fails to reach collector
            }
        }
        
        if (el.x > CANVAS_WIDTH - 60) {
            electrons.splice(i, 1); // Collected
        }
    }
    
    // Keep array size manageable
    if (electrons.length > 150) {
        electrons.shift();
    }
}

function updateLiveCurrent() {
    const aVolts = parseFloat(aVoltageSlider.value);
    const fVolts = parseFloat(fVoltageSlider.value);
    
    if (fVolts === 0) {
        currentValueDisplay.textContent = "0.00";
        return;
    }

    // Mathematical approximation of F-H curve for live display
    // I = I0 * (V^1.5) approx for thermionic, modified by F-H drops
    let bgCurrent = 0.05 * Math.pow(aVolts, 1.2);
    
    // Apply F-H drops at multiples of Excitation Potential
    let dropFactor = 1.0;
    if (aVolts > 0) {
        // Create drops at multiples
        let mod = aVolts % GAS_EXCITATION_POTENTIAL;
        // When near a multiple of excitation potential, current drops
        if (aVolts > GAS_EXCITATION_POTENTIAL - 0.5) {
            // Gaussian dip near multiples
            let nearestMultiple = Math.round(aVolts / GAS_EXCITATION_POTENTIAL);
            let distanceToPeak = Math.abs(aVolts - (nearestMultiple * GAS_EXCITATION_POTENTIAL));
            let dip = Math.exp(-(distanceToPeak * distanceToPeak) / 0.5);
            // Higher multiples mean wider/deeper dips practically, but we keep it simple
            dropFactor = 1.0 - (0.8 * dip);
        }
    }

    let theoreticalI = bgCurrent * dropFactor;
    // Add bit of noise
    theoreticalI += (Math.random() * 0.1 - 0.05);
    
    if (theoreticalI < 0) theoreticalI = 0.0;
    
    currentValueDisplay.textContent = theoreticalI.toFixed(2);
}

function startSimulation() {
    if (!isSimulationRunning) {
        isSimulationRunning = true;
        requestAnimationFrame(simulationLoop);
    }
}

function pauseSimulation() {
    isSimulationRunning = false;
}

function resetSimulation() {
    isSimulationRunning = false;
    electrons = [];
    fVoltageSlider.value = 0;
    aVoltageSlider.value = 0;
    fvValDisplay.textContent = "0.0";
    avValDisplay.textContent = "0.0";
    currentValueDisplay.textContent = "0.00";
    updateGuide();
    drawSimulationStatic();
}

function updateGuide() {
    const fv = parseFloat(fVoltageSlider.value);
    const av = parseFloat(aVoltageSlider.value);

    if (fv === 0) {
        guideBox.textContent = "Step 1: Increase filament voltage to emit electrons.";
    } else if (av < GAS_EXCITATION_POTENTIAL) {
        guideBox.textContent = "Step 2: Slowly increase accelerating voltage.";
    } else if (av >= GAS_EXCITATION_POTENTIAL && av < GAS_EXCITATION_POTENTIAL * 2) {
        guideBox.textContent = `Step 3: Excitation potential (~${GAS_EXCITATION_POTENTIAL}V) reached! Observe collisions and current drop.`;
    } else {
        guideBox.textContent = "Step 4: Record values in table and plot the graph.";
    }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', init);
