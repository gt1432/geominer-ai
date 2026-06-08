// Global configurations for GeoMiner AI Front-end
const API_BASE_URL = window.location.origin;

// Helper: Format coordinates to 5 decimal places
function formatLatLng(lat, lng) {
    return `${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`;
}

// Helper: Get badge CSS style based on confidence text
function getConfidenceBadgeClass(confidence) {
    const c = (confidence || '').toLowerCase();
    if (c === 'high') return 'badge-high';
    if (c === 'medium') return 'badge-medium';
    return 'badge-low';
}

// Helper: Format date strings beautifully
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString();
}
