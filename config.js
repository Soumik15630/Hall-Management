// /config.js

// =================================================================
// CENTRAL CONFIGURATION FILE
// =================================================================
// This file defines the global configuration for the application.
// It MUST be included in your HTML files BEFORE any other scripts.
// =================================================================

const AppConfig = {
    /**
     * The root domain for the backend services.
     */
    apiBaseUrl: 'https://hall-management.nirmaljyotib.workers.dev',

    /**
     * Specific paths for API endpoints.
     * Note: The login path is different from the main API paths.
     */
    endpoints: {
        // Auth endpoints
        login: '/auth/login',

        // Main API endpoints
        hall: '/api/hall',
        allHall: '/api/hall/all-hall',
        addHall: '/api/hall/create',
        allschool: '/api/school/all-schools',
        addschool: '/api/school/create',
        alldept: '/api/department/all-department',
        addDept: '/api/department/create',
        emp: '/api/employee',
        allemp: '/api/employee/all-employees',
        addemp: '/api/employee/create'
    },

    /**
     * Page links used for redirects within the application.
     */
    links: {
        // new login.html is index.html for github publication purpose
        login: 'index.html' // Relative path from root pages like hod.html
    }
};
