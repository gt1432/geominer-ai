// Dashboard Charting Handlers using Chart.js
let occChartInstance = null;
let actChartInstance = null;

// Listen for theme changes to dynamically update charts gridlines and text colors
document.addEventListener('themechange', (e) => {
    const isLight = e.detail.theme === 'light';
    const gridColor = isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.05)';
    const textColor = isLight ? '#475569' : '#94a3b8';
    const tooltipBg = isLight ? '#ffffff' : '#1e293b';
    const tooltipColor = isLight ? '#0f172a' : '#f8fafc';
    const tooltipBodyColor = isLight ? '#334155' : '#94a3b8';

    [occChartInstance, actChartInstance].forEach(chart => {
        if (chart) {
            chart.options.scales.y.grid.color = gridColor;
            chart.options.scales.y.ticks.color = textColor;
            chart.options.scales.x.ticks.color = textColor;
            chart.options.plugins.tooltip.backgroundColor = tooltipBg;
            chart.options.plugins.tooltip.titleColor = tooltipColor;
            chart.options.plugins.tooltip.bodyColor = tooltipBodyColor;
            chart.update();
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    // Only run if canvas elements are present (dashboard.html)
    const occCanvas = document.getElementById('occurrencesChart');
    const actCanvas = document.getElementById('activityChart');
    if (!occCanvas || !actCanvas) return;
    
    loadDashboardData(occCanvas, actCanvas);
});

let dashboardPredictionsList = [];
let currentDashboardTab = 'recent';

async function loadDashboardData(occCanvas, actCanvas) {
    try {
        // 1. Fetch Stats from server
        const statsResponse = await fetch(`${API_BASE_URL}/stats`);
        if (!statsResponse.ok) throw new Error(`Stats API error: ${statsResponse.status}`);
        const stats = await statsResponse.json();
        
        // Update metrics
        const requestCountEl = document.getElementById('stats-request-count');
        if (requestCountEl) requestCountEl.textContent = stats.totalPredictions || 0;

        const kpiTotal = document.getElementById('kpi-total-predictions');
        if (kpiTotal) kpiTotal.textContent = stats.totalPredictions || 0;

        const kpiSaved = document.getElementById('kpi-saved-projects');
        if (kpiSaved) kpiSaved.textContent = stats.savedProjectsCount || 0;

        const kpiAvgSuit = document.getElementById('kpi-avg-suitability');
        if (kpiAvgSuit) kpiAvgSuit.textContent = stats.averageSuitability || 0;
        
        dashboardPredictionsList = stats.predictionsList || [];
        
        // 2. Fetch Occurrences from server to plot commodities count
        const occResponse = await fetch(`${API_BASE_URL}/occurrences`);
        if (!occResponse.ok) throw new Error(`Occurrences API error: ${occResponse.status}`);
        const occurrences = await occResponse.json();
        
        const kpiOcc = document.getElementById('kpi-total-occurrences');
        if (kpiOcc) kpiOcc.textContent = occurrences.length || 357;
        
        // Count commodities frequency
        const commodityCounts = {};
        occurrences.forEach(occ => {
            let comm = (occ.commodity || 'Unknown').trim();
            // Simplify naming
            if (comm.toLowerCase().includes('magnetite') || comm.toLowerCase().includes('quartzite')) {
                comm = 'Iron Ore';
            } else if (comm.toLowerCase().includes('copper')) {
                comm = 'Copper';
            } else {
                comm = comm.charAt(0).toUpperCase() + comm.slice(1);
            }
            commodityCounts[comm] = (commodityCounts[comm] || 0) + 1;
        });
        
        // Prepare Chart 1 data
        const labels1 = Object.keys(commodityCounts);
        const data1 = Object.values(commodityCounts);
        
        // Dynamic colors on load
        const isLight = document.documentElement.classList.contains('light-theme');
        const gridColor = isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.05)';
        const textColor = isLight ? '#475569' : '#94a3b8';
        const tooltipBg = isLight ? '#ffffff' : '#1e293b';
        const tooltipColor = isLight ? '#0f172a' : '#f8fafc';
        const tooltipBodyColor = isLight ? '#334155' : '#94a3b8';

        if (occChartInstance) {
            occChartInstance.destroy();
        }

        occChartInstance = new Chart(occCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels1,
                datasets: [{
                    label: 'Target Occurrences Count',
                    data: data1,
                    backgroundColor: 'rgba(217, 160, 91, 0.6)',
                    borderColor: '#D9A05B',
                    borderWidth: 1.5,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { backgroundColor: tooltipBg, titleColor: tooltipColor, bodyColor: tooltipBodyColor }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    x: {
                        ticks: { color: textColor },
                        grid: { display: false }
                    }
                }
            }
        });
        
        // 3. Prepare Chart 2 (Recent Predictions Activity)
        const recentList = [...dashboardPredictionsList].slice(0, 10);
        // Extract scores and dates, reverse to show chronological order
        const recentReverse = [...recentList].reverse();
        
        const labels2 = recentReverse.map((item, idx) => {
            const date = new Date(item.createdAt);
            return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        });
        const data2 = recentReverse.map(item => item.mineral_probability);
        
        // Fallback dummy elements if no predictions have run yet
        const displayLabels = labels2.length > 0 ? labels2 : ['12:00', '13:00', '14:00', '15:00', '16:00'];
        const displayData = data2.length > 0 ? data2 : [10, 45, 25, 78, 62];
        
        if (actChartInstance) {
            actChartInstance.destroy();
        }

        actChartInstance = new Chart(actCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: displayLabels,
                datasets: [{
                    label: 'Probability Score %',
                    data: displayData,
                    borderColor: '#D9A05B',
                    backgroundColor: 'rgba(217, 160, 91, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#D9A05B'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { backgroundColor: tooltipBg, titleColor: tooltipColor, bodyColor: tooltipBodyColor }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    x: {
                        ticks: { color: textColor },
                        grid: { display: false }
                    }
                }
            }
        });
        
        // 4. Render Table list
        renderHistoryTable();
        
    } catch (err) {
        console.error('Failed to load dashboard charts and tables:', err);
    }
}

function renderHistoryTable() {
    const tableBody = document.getElementById('history-table-body');
    if (!tableBody) return;
    
    // Filter list based on current tab
    const filteredList = currentDashboardTab === 'saved' 
        ? dashboardPredictionsList.filter(item => item.saved_project === true)
        : dashboardPredictionsList.slice(0, 10); // Show top 10 recent
        
    if (filteredList.length > 0) {
        tableBody.innerHTML = '';
        filteredList.forEach(item => {
            const tr = document.createElement('tr');
            
            // Build the Action/Export buttons column
            const predId = item._id ? (item._id.$oid || item._id.toString() || item._id) : null;
            let actionHtml = '';
            if (predId) {
                actionHtml = `
                    <div class="flex gap-2 justify-center items-center">
                        <a href="${API_BASE_URL}/predictions/${predId}/pdf" target="_blank" class="border border-[#D9A05B]/50 text-[#D9A05B] px-2 py-1 rounded font-bold text-[10px] hover:bg-[#D9A05B]/10 transition-all" title="Download PDF">
                            <i class="fa-solid fa-file-pdf"></i> PDF
                        </a>
                        <a href="${API_BASE_URL}/predictions/${predId}/csv" target="_blank" class="border border-white/10 text-[#bac9cc] px-2 py-1 rounded font-bold text-[10px] hover:bg-white/5 transition-all" title="Download CSV">
                            <i class="fa-solid fa-file-csv"></i> CSV
                        </a>
                        <a href="${API_BASE_URL}/predictions/${predId}/json" target="_blank" class="border border-white/10 text-[#bac9cc] px-2 py-1 rounded font-bold text-[10px] hover:bg-white/5 transition-all" title="Download JSON">
                            <i class="fa-solid fa-code"></i> JSON
                        </a>
                    </div>
                `;
            } else {
                actionHtml = '<span class="text-gray-500">—</span>';
            }
            
            tr.innerHTML = `
                <td class="py-3">${formatDate(item.createdAt)}</td>
                <td class="py-3">${formatLatLng(item.latitude, item.longitude)}</td>
                <td class="py-3 font-medium text-white">${item.rock_type || 'Unknown'} (${item.rock_type_class || 'Unknown'})</td>
                <td class="py-3 text-right font-semibold text-[#D9A05B]">${item.mineral_probability || 0}%</td>
                <td class="py-3 text-right font-semibold text-[#F59E0B]">${item.suitability_score || 0} (${item.suitability_category || 'Poor'})</td>
                <td class="py-3 text-center">${actionHtml}</td>
            `;
            tableBody.appendChild(tr);
        });
    } else {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-12 text-[#bac9cc]">
                    ${currentDashboardTab === 'saved' 
                        ? 'No saved projects yet. Star predictions on the results page to save them.' 
                        : 'No predictions logged yet. Go to <a href="predict.html" class="text-[#D9A05B] hover:underline">Prediction page</a> to run a query.'}
                </td>
            </tr>
        `;
    }
}
window.renderHistoryTable = renderHistoryTable;

function switchDashboardTab(tab) {
    currentDashboardTab = tab;
    
    // Update tab button styles
    const btnRecent = document.getElementById('tab-btn-recent');
    const btnSaved = document.getElementById('tab-btn-saved');
    
    if (tab === 'saved') {
        if (btnRecent) {
            btnRecent.className = 'font-display text-base text-[#bac9cc] font-semibold pb-1 cursor-pointer hover:text-white transition-colors';
        }
        if (btnSaved) {
            btnSaved.className = 'font-display text-base text-[#D9A05B] font-bold border-b-2 border-[#D9A05B] pb-1 cursor-pointer';
        }
    } else {
        if (btnRecent) {
            btnRecent.className = 'font-display text-base text-[#D9A05B] font-bold border-b-2 border-[#D9A05B] pb-1 cursor-pointer';
        }
        if (btnSaved) {
            btnSaved.className = 'font-display text-base text-[#bac9cc] font-semibold pb-1 cursor-pointer hover:text-white transition-colors';
        }
    }
    
    renderHistoryTable();
}
window.switchDashboardTab = switchDashboardTab;

