// Dashboard Charting Handlers using Chart.js
document.addEventListener('DOMContentLoaded', () => {
    // Only run if canvas elements are present (dashboard.html)
    const occCanvas = document.getElementById('occurrencesChart');
    const actCanvas = document.getElementById('activityChart');
    if (!occCanvas || !actCanvas) return;
    
    loadDashboardData(occCanvas, actCanvas);
});

async function loadDashboardData(occCanvas, actCanvas) {
    try {
        // 1. Fetch Stats from server
        const statsResponse = await fetch(`${API_BASE_URL}/stats`);
        const stats = await statsResponse.json();
        
        // Update metric
        document.getElementById('stats-request-count').textContent = stats.totalPredictions || 0;
        
        // 2. Fetch Occurrences from server to plot commodities count
        const occResponse = await fetch(`${API_BASE_URL}/occurrences`);
        const occurrences = await occResponse.json();
        
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
        
        new Chart(occCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels1,
                datasets: [{
                    label: 'Target Occurrences Count',
                    data: data1,
                    backgroundColor: 'rgba(2, 132, 199, 0.6)',
                    borderColor: '#0284c7',
                    borderWidth: 1.5,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { backgroundColor: '#1e293b', titleColor: '#f8fafc', bodyColor: '#94a3b8' }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    x: {
                        ticks: { color: '#94a3b8' },
                        grid: { display: false }
                    }
                }
            }
        });
        
        // 3. Prepare Chart 2 (Recent Predictions Activity)
        const recentList = stats.predictionsList || [];
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
        
        new Chart(actCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: displayLabels,
                datasets: [{
                    label: 'Probability Score %',
                    data: displayData,
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#a855f7'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { backgroundColor: '#1e293b', titleColor: '#f8fafc', bodyColor: '#94a3b8' }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    x: {
                        ticks: { color: '#94a3b8' },
                        grid: { display: false }
                    }
                }
            }
        });
        
        // 4. Render Table list
        const tableBody = document.getElementById('history-table-body');
        if (recentList.length > 0) {
            tableBody.innerHTML = '';
            recentList.forEach(item => {
                const tr = document.createElement('tr');
                const badgeClass = getConfidenceBadgeClass(item.confidence);
                
                tr.innerHTML = `
                    <td>${formatDate(item.createdAt)}</td>
                    <td>${formatLatLng(item.latitude, item.longitude)}</td>
                    <td>${item.rock_type}</td>
                    <td style="font-weight: 600; color: var(--primary-light);">${item.mineral_probability}%</td>
                    <td><span class="badge ${badgeClass}">${item.confidence}</span></td>
                    <td>${(item.predicted_minerals || []).join(', ')}</td>
                    <td>
                        <a href="${API_BASE_URL}/predictions/${item._id}/pdf" class="btn-primary" style="padding: 5px 10px; font-size: 0.75rem; gap: 4px;">
                            <i class="fa-solid fa-download"></i> PDF
                        </a>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
        } else {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">
                        No predictions logged yet. Go to <a href="predict.html" style="color: var(--primary-light);">Prediction page</a> to run a query.
                    </td>
                </tr>
            `;
        }
        
    } catch (err) {
        console.error('Failed to load dashboard charts and tables:', err);
    }
}
