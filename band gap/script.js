document.addEventListener('DOMContentLoaded', () => {

    // --- TAB NAVIGATION LOGIC ---
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.section-content');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            btn.classList.add('active');
            const targetSection = document.getElementById(btn.dataset.target);
            if(targetSection) targetSection.classList.add('active');
        });
    });

    // --- PHYSICS & MATERIAL STATE ---
    const k_B = 8.617e-5; 
    const geo_factor = 2.0; 

    // Define material properties
    const materials = {
        'Ge': { name: 'Germanium', Eg: 0.66, A: 0.003, color: 'linear-gradient(180deg, #71717a 0%, #3f3f46 100%)' },
        'Si': { name: 'Silicon', Eg: 1.12, A: 0.0000008, color: 'linear-gradient(180deg, #3b82f6 0%, #1e3a8a 100%)' } 
    };

    let currentMaterial = 'Ge';
    let isPoweredOn = false;
    let current_mA = 5.0;
    let temp_C = 25;
    let voltage_mV = 0;
    let recordedData = []; 
    let recordedTemps = new Set(); 

    // DOM Elements
    const materialRadios = document.querySelectorAll('input[name="material"]');
    const sampleVisual = document.getElementById('sample-visual');

    const btnPower = document.getElementById('btn-power');
    const btnRecord = document.getElementById('btn-record');
    const btnClear = document.getElementById('btn-clear');
    const btnCalculate = document.getElementById('btn-calculate');
    
    const sliderCurrent = document.getElementById('slider-current');
    const sliderTemp = document.getElementById('slider-temp');
    
    const labelCurrent = document.getElementById('label-current');
    const labelTemp = document.getElementById('label-temp');
    
    const dispVoltage = document.getElementById('disp-voltage');
    const dispCurrent = document.getElementById('disp-current');
    const dispTemp = document.getElementById('disp-temp');
    const ovenGlow = document.getElementById('oven-glow');
    const tableBody = document.querySelector('#data-table tbody');
    
    const resultBox = document.getElementById('result-box');
    const finalEgDisplay = document.getElementById('final-eg');

    // --- CHART.JS INITIALIZATION ---
    let myChart = null;
    try {
        const ctx = document.getElementById('bandgapChart').getContext('2d');
        Chart.defaults.color = '#a1a1aa';
        Chart.defaults.font.family = "'Inter', sans-serif";

        myChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [
                    { label: 'Recorded Data', data: [], backgroundColor: '#06b6d4', borderColor: '#06b6d4', pointRadius: 6 },
                    { label: 'Line of Best Fit', data: [], type: 'line', borderColor: '#f59e0b', borderWidth: 2, pointRadius: 0, fill: false, borderDash: [5, 5] }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: '10³/T (K⁻¹)', color: '#f4f4f5' }, grid: { color: '#27272a' } },
                    y: { title: { display: true, text: 'log₁₀(ρ)', color: '#f4f4f5' }, grid: { color: '#27272a' } }
                }
            }
        });
    } catch (e) { console.warn("Chart failed to load.", e); }

    // --- MAIN PHYSICS ENGINE ---
    function updateSimulation() {
        if (!isPoweredOn) {
            if(dispVoltage) dispVoltage.innerText = "00.00";
            if(dispCurrent) dispCurrent.innerText = "00.00";
            if(dispTemp) dispTemp.innerText = "25.0";
            if(ovenGlow) ovenGlow.style.background = `radial-gradient(circle, rgba(255,60,0,0) 0%, #050505 100%)`;
            return;
        }

        current_mA = parseFloat(sliderCurrent?.value || 5);
        temp_C = parseFloat(sliderTemp?.value || 25);
        let temp_K = temp_C + 273.15;

        if(labelCurrent) labelCurrent.innerText = `${current_mA.toFixed(1)} mA`;
        if(labelTemp) labelTemp.innerText = `${temp_C} \u00B0C`;
        if(dispCurrent) dispCurrent.innerText = current_mA.toFixed(2);
        if(dispTemp) dispTemp.innerText = temp_C.toFixed(1);

        // Fetch active material properties
        let activeMat = materials[currentMaterial];

        let resistivity = activeMat.A * Math.exp(activeMat.Eg / (2 * k_B * temp_K));
        let raw_voltage = (resistivity * current_mA) / geo_factor;
        let noise = raw_voltage * (Math.random() * 0.006 - 0.003); // +/- 0.3% noise
        voltage_mV = raw_voltage + noise;

        // Cap display format so it doesn't break layout if numbers get massive
        if(dispVoltage) dispVoltage.innerText = voltage_mV > 9999 ? "O.L" : voltage_mV.toFixed(2);

        let heatRatio = (temp_C - 25) / 125; 
        let r = 255;
        let g = Math.floor(60 + (heatRatio * 60)); 
        let alpha = 0.1 + (heatRatio * 0.6);
        if(ovenGlow) ovenGlow.style.background = `radial-gradient(circle, rgba(${r},${g},0,${alpha}) 0%, #050505 70%)`;
    }

    // --- MATERIAL TOGGLE LISTENER (FIXED) ---
    materialRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentMaterial = e.target.value;
            
            // Update Visuals and Text Label dynamically
            const dynamicLabel = document.getElementById('material-label') || document.querySelector('.ge-label');
            if(dynamicLabel) {
                dynamicLabel.innerText = materials[currentMaterial].name;
            }
            if(sampleVisual) {
                sampleVisual.style.background = materials[currentMaterial].color;
            }
            
            // Clear old data so we don't mix Silicon and Germanium points
            if(btnClear) btnClear.click();
            
            updateSimulation();
        });
    });

    // --- OTHER INTERACTIVE EVENT LISTENERS ---
    btnPower?.addEventListener('click', () => {
        isPoweredOn = !isPoweredOn;
        if (isPoweredOn) {
            btnPower.innerText = "System Power: ON";
            btnPower.classList.add('on');
            if(sliderCurrent) sliderCurrent.disabled = false;
            if(sliderTemp) sliderTemp.disabled = false;
            if(btnRecord) btnRecord.disabled = false;
            dispVoltage?.classList.add('active-cyan');
            dispCurrent?.classList.add('active-cyan');
        } else {
            btnPower.innerText = "System Power: OFF";
            btnPower.classList.remove('on');
            if(sliderCurrent) sliderCurrent.disabled = true;
            if(sliderTemp) sliderTemp.disabled = true;
            if(btnRecord) btnRecord.disabled = true;
            dispVoltage?.classList.remove('active-cyan');
            dispCurrent?.classList.remove('active-cyan');
        }
        updateSimulation();
    });

    sliderCurrent?.addEventListener('input', updateSimulation);
    sliderTemp?.addEventListener('input', updateSimulation);

    btnRecord?.addEventListener('click', () => {
        if(voltage_mV > 9999) {
            alert("Voltage Overload! Increase temperature to lower resistivity before recording.");
            return;
        }

        if(recordedTemps.has(temp_C)) {
            alert("You have already recorded a reading for this temperature.");
            return;
        }

        let temp_K = temp_C + 273.15;
        let currentResistivity = (voltage_mV / current_mA) * geo_factor;
        let invT_1000 = 1000 / temp_K;
        let logRho = Math.log10(currentResistivity);

        recordedTemps.add(temp_C);
        recordedData.push({ x: invT_1000, y: logRho });

        if(tableBody) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${temp_C}</td>
                <td>${temp_K.toFixed(2)}</td>
                <td>${voltage_mV.toFixed(2)}</td>
                <td>${currentResistivity.toFixed(3)}</td>
                <td>${invT_1000.toFixed(3)}</td>
                <td>${logRho.toFixed(4)}</td>
            `;
            tableBody.appendChild(row);
        }

        if(myChart) {
            myChart.data.datasets[0].data = recordedData;
            myChart.update();
        }

        if (recordedData.length >= 5 && btnCalculate) {
            btnCalculate.disabled = false;
            btnCalculate.innerText = "Calculate Bandgap";
        }
    });

    btnClear?.addEventListener('click', () => {
        recordedData = [];
        recordedTemps.clear();
        if(tableBody) tableBody.innerHTML = '';
        if(myChart) {
            myChart.data.datasets[0].data = [];
            myChart.data.datasets[1].data = [];
            myChart.update();
        }
        if(btnCalculate) {
            btnCalculate.disabled = true;
            btnCalculate.innerText = "Calculate Bandgap (Need 5 points)";
        }
        resultBox?.classList.add('hidden');
    });

    btnCalculate?.addEventListener('click', () => {
        let n = recordedData.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        recordedData.forEach(p => {
            sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumX2 += p.x * p.x;
        });

        let m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        let c = (sumY - m * sumX) / n;

        if(myChart) {
            let minX = Math.min(...recordedData.map(d => d.x));
            let maxX = Math.max(...recordedData.map(d => d.x));
            myChart.data.datasets[1].data = [
                { x: minX, y: m * minX + c },
                { x: maxX, y: m * maxX + c }
            ];
            myChart.update();
        }

        let calculated_Eg = m * 4606 * k_B;
        if(finalEgDisplay) finalEgDisplay.innerText = calculated_Eg.toFixed(3);
        resultBox?.classList.remove('hidden');
        
        btnCalculate.disabled = true;
        btnCalculate.innerText = "Calculation Complete";
    });
});