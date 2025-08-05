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
            apiBaseUrl: 'https://hall-management.nirmaljyotib.workers.dev/',
            endpoints: {
                login: 'auth/login',
                hall: 'api/hall',
                allHall: 'api/hall/all-hall',
                addHall: 'api/hall/create',
                school: 'api/school',
                allschool: 'api/school/all-schools',
                addschool: 'api/school/create',
                department: 'api/department',
                alldept: 'api/department/all-department',
                addDept: 'api/department/create',
                emp:'api/employee',
                allemp: 'api/employee/all-employees',
                addemp: 'api/employee/create',
                booking: 'api/booking',
                bookingRequest: 'api/booking/request',
                myBookings: 'api/booking/my-requests',
                pendingApprovals: 'api/booking/pending-approval'
            },
            links: {
                login: 'index.html'
            }
        };