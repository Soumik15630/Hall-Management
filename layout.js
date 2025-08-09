// =================================================================
// ALL-IN-ONE SMART LAYOUT SCRIPT (with full mobile navigation)
// =================================================================
// This single file contains the complete HTML for all navbars (desktop and mobile)
// and the logic to display the correct one based on the user's role.
// =================================================================

// --- 1. HTML TEMPLATES ---

const adminNavbarTemplate = `
<div x-data="navbarData()" @click.away="closeAllDropdowns()">
    <!-- Header -->
    <header class="bg-black bg-opacity-60 text-white shadow-lg sticky top-0 z-50">
        <div class="container mx-auto px-4">
            <div class="flex items-center justify-between py-3">
                <div class="flex items-center space-x-3 min-w-0">
                    <div class="h-12 w-12 sm:h-14 sm:w-14 rounded-full overflow-hidden flex-shrink-0">
                        <img src="LOGO_LINK" alt="Logo" class="w-full h-full object-contain bg-white bg-opacity-10 rounded-full p-1">
                    </div>
                    <div>
                        <h1 class="text-sm sm:text-lg lg:text-xl font-semibold leading-tight">PONDICHERRY UNIVERSITY</h1>
                        <div class="text-xs text-gray-300">Admin Panel</div>
                    </div>
                </div>
                <div class="hidden lg:flex items-center space-x-4">
                    <span class="text-lg font-medium" id="user-role-desktop">ADMIN</span>
                    <span class="text-lg text-gray-400">|</span>
                    <button onclick="logout()" class="text-lg font-medium hover:text-red-400 transition-colors duration-200 flex items-center space-x-2">
                        <span>LOGOUT</span><i class="fas fa-sign-out-alt"></i>
                    </button>
                </div>
                <button @click="toggleMobileMenu()" class="lg:hidden p-2 rounded-md hover:bg-white hover:bg-opacity-10 focus:outline-none">
                    <i class="fas" :class="mobileMenuOpen ? 'fa-times' : 'fa-bars'"></i>
                </button>
            </div>
        </div>
    </header>

    <!-- Desktop Navigation -->
    <nav class="bg-white bg-opacity-10 text-white shadow-lg hidden lg:block">
        <div class="container mx-auto px-4">
            <div class="flex justify-center items-center space-x-8 py-3">
                <a href="ADMIN_DASH_LINK" class="text-lg font-medium hover:text-blue-300">DASHBOARD</a>
                <div class="relative" x-data="{ open: false }" @click.away="open = false">
                    <button @click="open = !open" class="text-lg font-medium hover:text-blue-300 flex items-center">HALL DETAILS <i class="fas fa-chevron-down text-sm ml-2 transition-transform" :class="{ 'rotate-180': open }"></i></button>
                    <div x-show="open" x-transition class="absolute mt-2 w-56 bg-gray-800 rounded-lg shadow-xl py-2 z-20">
                        <a href="ADD_HALL_LINK" class="block px-4 py-3 text-sm hover:bg-gray-700">Add Hall</a>
                        <a href="MANAGE_HALL_LINK" class="block px-4 py-3 text-sm hover:bg-gray-700">Manage Halls</a>
                    </div>
                </div>
                <div class="relative" x-data="{ open: false }" @click.away="open = false">
                    <button @click="open = !open" class="text-lg font-medium hover:text-blue-300 flex items-center">SCHOOL/DEPT <i class="fas fa-chevron-down text-sm ml-2 transition-transform" :class="{ 'rotate-180': open }"></i></button>
                    <div x-show="open" x-transition class="absolute mt-2 w-64 bg-gray-800 rounded-lg shadow-xl py-2 z-20">
                        <a href="ADD_SD_LINK" class="block px-4 py-3 text-sm hover:bg-gray-700">Add School/Department</a>
                        <a href="MANAGE_SD_LINK" class="block px-4 py-3 text-sm hover:bg-gray-700">Manage School/Department</a>
                    </div>
                </div>
                <div class="relative" x-data="{ open: false }" @click.away="open = false">
                    <button @click="open = !open" class="text-lg font-medium hover:text-blue-300 flex items-center">EMPLOYEE DETAILS <i class="fas fa-chevron-down text-sm ml-2 transition-transform" :class="{ 'rotate-180': open }"></i></button>
                    <div x-show="open" x-transition class="absolute mt-2 w-56 bg-gray-800 rounded-lg shadow-xl py-2 z-20">
                        <a href="EMPLOYEE_LINK" class="block px-4 py-3 text-sm hover:bg-gray-700">Add Employee</a>
                        <a href="MANAGE_EMPLOYEE_LINK" class="block px-4 py-3 text-sm hover:bg-gray-700">View Employees</a>
                    </div>
                </div>
            </div>
        </div>
    </nav>
    
    <!-- Mobile Navigation Menu -->
    <div x-show="mobileMenuOpen" x-transition class="lg:hidden bg-gray-800 border-t border-gray-600">
        <div class="px-4 py-2 space-y-1">
            <a href="ADMIN_DASH_LINK" @click="closeMobileMenu()" class="flex items-center space-x-3 py-3 px-3 rounded-md text-white hover:bg-gray-700">
                <i class="fas fa-tachometer-alt w-5"></i><span>Dashboard</span>
            </a>
            <div>
                <button @click="toggleDropdown('hall')" class="w-full flex justify-between items-center py-3 px-3 rounded-md text-white hover:bg-gray-700">
                    <span class="flex items-center space-x-3"><i class="fas fa-building w-5"></i><span>Hall Details</span></span>
                    <i class="fas fa-chevron-down text-sm transition-transform" :class="{ 'rotate-180': activeDropdown === 'hall' }"></i>
                </button>
                <div x-show="activeDropdown === 'hall'" class="ml-8 mt-1 space-y-1">
                    <a href="ADD_HALL_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Add Hall</a>
                    <a href="MANAGE_HALL_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Manage Halls</a>
                </div>
            </div>
            <div>
                <button @click="toggleDropdown('sd')" class="w-full flex justify-between items-center py-3 px-3 rounded-md text-white hover:bg-gray-700">
                     <span class="flex items-center space-x-3"><i class="fas fa-university w-5"></i><span>School/Dept</span></span>
                    <i class="fas fa-chevron-down text-sm transition-transform" :class="{ 'rotate-180': activeDropdown === 'sd' }"></i>
                </button>
                <div x-show="activeDropdown === 'sd'" class="ml-8 mt-1 space-y-1">
                    <a href="ADD_SD_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Add School/Dept</a>
                    <a href="MANAGE_SD_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Manage School/Dept</a>
                </div>
            </div>
            <div>
                <button @click="toggleDropdown('emp')" class="w-full flex justify-between items-center py-3 px-3 rounded-md text-white hover:bg-gray-700">
                     <span class="flex items-center space-x-3"><i class="fas fa-users w-5"></i><span>Employee Details</span></span>
                    <i class="fas fa-chevron-down text-sm transition-transform" :class="{ 'rotate-180': activeDropdown === 'emp' }"></i>
                </button>
                <div x-show="activeDropdown === 'emp'" class="ml-8 mt-1 space-y-1">
                    <a href="EMPLOYEE_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Add Employee</a>
                    <a href="MANAGE_EMPLOYEE_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">View Employees</a>
                </div>
            </div>
            <div class="border-t border-gray-600 mt-4 pt-3">
                <button onclick="logout()" class="w-full flex items-center space-x-3 py-3 px-3 rounded-md text-red-400 hover:bg-red-900 hover:bg-opacity-20">
                    <i class="fas fa-sign-out-alt w-5"></i><span>Logout</span>
                </button>
            </div>
        </div>
    </div>
</div>
`;

const facultyNavbarTemplate = `
<div x-data="navbarData()" @click.away="closeAllDropdowns()">
    <!-- Header -->
    <header class="bg-black bg-opacity-60 text-white shadow-lg sticky top-0 z-50">
        <div class="container mx-auto px-4">
            <div class="flex items-center justify-between py-3">
                <div class="flex items-center space-x-3 min-w-0">
                    <div class="h-12 w-12 sm:h-14 sm:w-14 rounded-full overflow-hidden flex-shrink-0">
                        <img src="LOGO_LINK" alt="Logo" class="w-full h-full object-contain bg-white bg-opacity-10 rounded-full p-1">
                    </div>
                    <div>
                        <h1 class="text-sm sm:text-lg lg:text-xl font-semibold leading-tight">PONDICHERRY UNIVERSITY</h1>
                        <div class="text-xs text-gray-300" id="user-role-title">User Panel</div>
                    </div>
                </div>
                <div class="hidden lg:flex items-center space-x-4">
                    <span class="text-lg font-medium" id="user-role-desktop">USER</span>
                    <span class="text-lg text-gray-400">|</span>
                    <button onclick="logout()" class="text-lg font-medium hover:text-red-400 transition-colors duration-200 flex items-center space-x-2">
                        <span>LOGOUT</span><i class="fas fa-sign-out-alt"></i>
                    </button>
                </div>
                <button @click="toggleMobileMenu()" class="lg:hidden p-2 rounded-md hover:bg-white hover:bg-opacity-10 focus:outline-none">
                    <i class="fas" :class="mobileMenuOpen ? 'fa-times' : 'fa-bars'"></i>
                </button>
            </div>
        </div>
    </header>

    <!-- Desktop Navigation -->
    <nav class="bg-white bg-opacity-10 text-white shadow-lg hidden lg:block">
        <div class="container mx-auto px-4">
            <div class="flex justify-center items-center space-x-8 py-3">
                <a href="DASHBOARD_LINK" class="text-lg font-medium hover:text-blue-300">DASHBOARD</a>
                <div class="relative" x-data="{ open: false }" @click.away="open = false">
                    <button @click="open = !open" class="text-lg font-medium hover:text-blue-300 flex items-center">BOOK THE HALL <i class="fas fa-chevron-down text-sm ml-2 transition-transform" :class="{ 'rotate-180': open }"></i></button>
                    <div x-show="open" x-transition class="absolute mt-2 w-56 bg-gray-800 rounded-lg shadow-xl py-2 z-20">
                        <a href="BOOK_AND_BROWSE_LINK" class="block px-4 py-3 text-sm hover:bg-gray-700">Browse & Book Hall</a>
                        <a href="MY_BOOKINGS_LINK" class="block px-4 py-3 text-sm hover:bg-gray-700">My Bookings</a>
                    </div>
                </div>
            </div>
        </div>
    </nav>

    <!-- Mobile Navigation Menu -->
    <div x-show="mobileMenuOpen" x-transition class="lg:hidden bg-gray-800 border-t border-gray-600">
        <div class="px-4 py-2 space-y-1">
            <a href="DASHBOARD_LINK" @click="closeMobileMenu()" class="flex items-center space-x-3 py-3 px-3 rounded-md text-white hover:bg-gray-700">
                <i class="fas fa-tachometer-alt w-5"></i><span>Dashboard</span>
            </a>
            <div>
                <button @click="toggleDropdown('booking')" class="w-full flex justify-between items-center py-3 px-3 rounded-md text-white hover:bg-gray-700">
                    <span class="flex items-center space-x-3"><i class="fas fa-calendar-check w-5"></i><span>Book The Hall</span></span>
                    <i class="fas fa-chevron-down text-sm transition-transform" :class="{ 'rotate-180': activeDropdown === 'booking' }"></i>
                </button>
                <div x-show="activeDropdown === 'booking'" class="ml-8 mt-1 space-y-1">
                    <a href="BOOK_AND_BROWSE_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Browse & Book Hall</a>
                    <a href="MY_BOOKINGS_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">My Bookings</a>
                </div>
            </div>
            <div class="border-t border-gray-600 mt-4 pt-3">
                <button onclick="logout()" class="w-full flex items-center space-x-3 py-3 px-3 rounded-md text-red-400 hover:bg-red-900 hover:bg-opacity-20">
                    <i class="fas fa-sign-out-alt w-5"></i><span>Logout</span>
                </button>
            </div>
        </div>
    </div>
</div>
`;


// --- 2. HELPER FUNCTIONS ---

/**
 * Gets the user's role from the 'roleToken' in sessionStorage.
 * This function is now robust and handles both simple strings and JWTs.
 * @returns {string|null} The role in uppercase ('ADMIN', 'HOD', 'FACULTY') or null.
 */
function getUserRole() {
    const token = sessionStorage.getItem('roleToken');

    if (!token) {
        console.error("DEBUG: 'roleToken' not found in sessionStorage.");
        return null;
    }

    // Check if the token is a JWT (contains dots) or a simple string.
    if (token.includes('.')) {
        // It's likely a JWT, try to decode it.
        try {
            const decoded = JSON.parse(atob(token.split('.')[1]));
            console.log("DEBUG: Decoded JWT payload:", decoded);
            // Look for the 'role' property and return it in uppercase.
            return decoded && decoded.role ? decoded.role.toUpperCase() : null;
        } catch (e) {
            console.error("DEBUG: Failed to decode token as JWT.", e);
            return null;
        }
    } else {
        // It's a simple string, use it directly.
        console.log(`DEBUG: Found simple string roleToken: '${token}'`);
        // Return the simple string in uppercase for consistency.
        return token.toUpperCase();
    }
}


// --- 3. MAIN NAVBAR LOADER ---

function loadNavbar() {
    if (typeof AppConfig === 'undefined') {
        console.error('CRITICAL: AppConfig is not defined. Load config.js first.');
        return;
    }

    const role = getUserRole();
    console.log(`DEBUG: Final role is '${role}'. Preparing to load navbar.`);
    
    let template = '';
    let replacements = {};

    switch (role) {
        case 'ADMIN':
            template = adminNavbarTemplate;
            replacements = {
                'LOGO_LINK': AppConfig.links.logo, 'ADMIN_DASH_LINK': AppConfig.links.adminDash,
                'ADD_HALL_LINK': AppConfig.links.addHall, 'MANAGE_HALL_LINK': AppConfig.links.manageHall,
                'ADD_SD_LINK': AppConfig.links.addSD, 'MANAGE_SD_LINK': AppConfig.links.manageSD,
                'EMPLOYEE_LINK': AppConfig.links.employee, 'MANAGE_EMPLOYEE_LINK': AppConfig.links.manageEmployee,
            };
            break;
        case 'FACULTY':
        case 'HOD':
            template = facultyNavbarTemplate;
            replacements = {
                'LOGO_LINK': AppConfig.links.logo,
                'DASHBOARD_LINK': role === 'HOD' ? AppConfig.links.hodDash : AppConfig.links.facultyDash,
                'BOOK_AND_BROWSE_LINK': AppConfig.links.bookAndBrowse, 'MY_BOOKINGS_LINK': AppConfig.links.myBookings,
            };
            break;
        default:
            console.error(`DEBUG: Role '${role}' is not valid or is null. Executing logout to protect the application.`);
            logout();
            return; // Stop execution
    }

    let populatedHtml = template;
    for (const placeholder in replacements) {
        populatedHtml = populatedHtml.replace(new RegExp(placeholder, 'g'), replacements[placeholder]);
    }

    const container = document.getElementById('nav-placeholder');
    if (container) {
        container.innerHTML = populatedHtml;
        const roleDisplay = container.querySelector('#user-role-desktop');
        if(roleDisplay) roleDisplay.textContent = role;
        if (window.Alpine) { window.Alpine.initTree(container); }
    } else {
        console.error("The '#nav-placeholder' div was not found in the document.");
    }
}


// --- 4. ALPINE.JS DATA ---

function navbarData() {
    return {
        mobileMenuOpen: false,
        activeDropdown: null,
        toggleMobileMenu() {
            this.mobileMenuOpen = !this.mobileMenuOpen;
            if (!this.mobileMenuOpen) this.activeDropdown = null;
        },
        closeMobileMenu() {
            this.mobileMenuOpen = false;
            this.activeDropdown = null;
        },
        toggleDropdown(dropdown) {
            this.activeDropdown = this.activeDropdown === dropdown ? null : dropdown;
        },
        closeAllDropdowns() {
            this.activeDropdown = null;
        }
    };
}


// --- 5. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', loadNavbar);
