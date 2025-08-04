// =================================================================
// CENTRAL CONFIGURATION FILE
// =================================================================
// Place all your important links and API endpoints here.
// To use a link in any HTML file, make sure to include this script first.
// Example usage in your JS: AppConfig.apiBaseUrl + AppConfig.endpoints.createEmployee
// =================================================================
function logout(){
    sessionStorage.removeItem('authToken');
    window.location.href = AppConfig.links.login; // Adjust to your login page path
}

function getAuthHeaders() {
                const token = sessionStorage.getItem('authToken');
                if (!token) return null;
                return {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                };
            }

const AppConfig = {
    // Base URL for your API. All endpoint URLs will be appended to this.
    apiBaseUrl: 'https://hall-management.nirmaljyotib.workers.dev/',

    // Specific API endpoints
    endpoints: {
        login: 'auth/login',
        hall: 'api/hall',
        allHall: 'api/hall/all-hall',
        addHall: 'api/hall/create',
        allschool: 'api/school/all-schools',
        addschool: 'api/school/create',
        alldept: 'api/department/all-department',
        addDept: 'api/department/create',
        emp:'api/employee',
        allemp: 'api/employee/all-employees',
        addemp: 'api/employee/create'
        // Add other API endpoints here, e.g., deleteEmployee: '/employee/delete'
    },

    links: {
        login: 'index.html'
    }
};