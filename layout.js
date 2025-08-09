// =================================================================
// ALL-IN-ONE SMART LAYOUT SCRIPT (with UI/UX Enhancements)
// =================================================================
// This single file contains the complete HTML for all navbars (desktop and mobile)
// and the logic to display the correct one based on the user's role.
// =================================================================

// --- 1. HTML TEMPLATES ---

const adminNavbarTemplate = `
<div x-data="navbarData()" @click.away="closeAllDropdowns()">
    <!-- This div wraps the header and nav, making them stick together -->
    <div class="sticky top-0 z-50">
        <!-- Header with a new, theme-matching color scheme and glass effect -->
        <header class="bg-slate-900 bg-opacity-75 backdrop-blur-sm text-white shadow-lg border-b border-white/10">
            <div class="container mx-auto px-4">
                <div class="flex items-center justify-between py-3">
                    <div class="flex items-center space-x-4 min-w-0">
                        <div class="h-12 w-12 sm:h-14 sm:w-14 rounded-full overflow-hidden flex-shrink-0 border-2 border-white/20">
                            <img src="LOGO_LINK" alt="Logo" class="w-full h-full object-contain bg-slate-800 p-1">
                        </div>
                        <div>
                            <h1 class="text-sm sm:text-lg lg:text-xl font-semibold leading-tight tracking-wide">PONDICHERRY UNIVERSITY</h1>
                            <div class="text-xs text-gray-400 opacity-90">Admin Panel</div>
                        </div>
                    </div>
                    <div class="hidden xl:flex items-center space-x-4">
                        <span class="text-lg font-medium" id="user-role-desktop">ADMIN</span>
                        <span class="text-lg text-gray-600">|</span>
                        <button onclick="logout()" class="text-lg font-medium hover:text-red-400 transition-colors duration-200 flex items-center space-x-2">
                            <span>LOGOUT</span><i class="fas fa-sign-out-alt"></i>
                        </button>
                    </div>
                    <button @click="toggleMobileMenu()" class="xl:hidden p-2 rounded-md hover:bg-white/10 focus:outline-none">
                        <i class="fas h-6 w-6" :class="mobileMenuOpen ? 'fa-times' : 'fa-bars'"></i>
                    </button>
                </div>
            </div>
        </header>

        <!-- Desktop Navigation with updated colors and active state -->
        <nav class="bg-slate-800 bg-opacity-60 backdrop-blur-sm text-white shadow-md hidden xl:block">
            <div class="container mx-auto px-4">
                <div class="flex justify-center items-center space-x-2">
                    <a href="ADMIN_DASH_LINK" class="nav-item text-base font-medium hover:bg-cyan-500/10 text-gray-200 px-4 pt-3 pb-2 transition-all duration-200" data-page="admin">DASHBOARD</a>
                    <div class="relative" x-data="{ open: false }" @click.away="open = false">
                        <button @click="open = !open" class="nav-item text-base font-medium hover:bg-cyan-500/10 text-gray-200 px-4 pt-3 pb-2 transition-all duration-200 flex items-center" data-page-group="hall">HALL DETAILS <i class="fas fa-chevron-down text-xs ml-2 transition-transform" :class="{ 'rotate-180': open }"></i></button>
                        <div x-show="open" x-transition class="absolute mt-2 w-56 bg-slate-800/95 backdrop-blur-md border border-white/10 rounded-lg shadow-xl py-2 z-20">
                            <a href="ADD_HALL_LINK" class="block px-4 py-2 text-sm text-gray-200 hover:bg-cyan-500/20 hover:text-white">Add Hall</a>
                            <a href="MANAGE_HALL_LINK" class="block px-4 py-2 text-sm text-gray-200 hover:bg-cyan-500/20 hover:text-white">Manage Halls</a>
                        </div>
                    </div>
                    <div class="relative" x-data="{ open: false }" @click.away="open = false">
                        <button @click="open = !open" class="nav-item text-base font-medium hover:bg-cyan-500/10 text-gray-200 px-4 pt-3 pb-2 transition-all duration-200 flex items-center" data-page-group="sd">SCHOOL/DEPT <i class="fas fa-chevron-down text-xs ml-2 transition-transform" :class="{ 'rotate-180': open }"></i></button>
                        <div x-show="open" x-transition class="absolute mt-2 w-64 bg-slate-800/95 backdrop-blur-md border border-white/10 rounded-lg shadow-xl py-2 z-20">
                            <a href="ADD_SD_LINK" class="block px-4 py-2 text-sm text-gray-200 hover:bg-cyan-500/20 hover:text-white">Add School/Department</a>
                            <a href="MANAGE_SD_LINK" class="block px-4 py-2 text-sm text-gray-200 hover:bg-cyan-500/20 hover:text-white">Manage School/Department</a>
                        </div>
                    </div>
                    <div class="relative" x-data="{ open: false }" @click.away="open = false">
                        <button @click="open = !open" class="nav-item text-base font-medium hover:bg-cyan-500/10 text-gray-200 px-4 pt-3 pb-2 transition-all duration-200 flex items-center" data-page-group="employee">EMPLOYEE DETAILS <i class="fas fa-chevron-down text-xs ml-2 transition-transform" :class="{ 'rotate-180': open }"></i></button>
                        <div x-show="open" x-transition class="absolute mt-2 w-56 bg-slate-800/95 backdrop-blur-md border border-white/10 rounded-lg shadow-xl py-2 z-20">
                            <a href="ADD_EMPLOYEE_LINK" class="block px-4 py-2 text-sm text-gray-200 hover:bg-cyan-500/20 hover:text-white">Add Employee</a>
                            <a href="MANAGE_EMPLOYEE_LINK" class="block px-4 py-2 text-sm text-gray-200 hover:bg-cyan-500/20 hover:text-white">View Employees</a>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    </div>
    
    <!-- Mobile Navigation Menu -->
    <div x-show="mobileMenuOpen" x-transition:enter="transition ease-out duration-300" x-transition:enter-start="opacity-0 -translate-y-4" x-transition:enter-end="opacity-100 translate-y-0" x-transition:leave="transition ease-in duration-200" x-transition:leave-start="opacity-100 translate-y-0" x-transition:leave-end="opacity-0 -translate-y-4" class="xl:hidden bg-slate-900/95 backdrop-blur-sm border-t border-white/10 fixed top-[76px] left-0 right-0 z-40 max-h-[calc(100vh-76px)] overflow-y-auto">
        <div class="px-4 py-4 space-y-2">
            <a href="ADMIN_DASH_LINK" @click="closeMobileMenu()" class="flex items-center space-x-4 py-3 px-3 rounded-md text-white hover:bg-cyan-500/10">
                <i class="fas fa-tachometer-alt w-5 text-cyan-400"></i><span class="font-medium">Dashboard</span>
            </a>
            <div>
                <button @click="toggleDropdown('hall')" class="w-full flex justify-between items-center py-3 px-3 rounded-md text-white hover:bg-cyan-500/10">
                    <span class="flex items-center space-x-4"><i class="fas fa-building w-5 text-cyan-400"></i><span class="font-medium">Hall Details</span></span>
                    <i class="fas fa-chevron-down text-sm transition-transform" :class="{ 'rotate-180': activeDropdown === 'hall' }"></i>
                </button>
                <div x-show="activeDropdown === 'hall'" class="ml-9 mt-2 space-y-2 border-l-2 border-cyan-500/20 pl-4">
                    <a href="ADD_HALL_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-cyan-500/10 hover:text-white">Add Hall</a>
                    <a href="MANAGE_HALL_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-cyan-500/10 hover:text-white">Manage Halls</a>
                </div>
            </div>
            <div>
                <button @click="toggleDropdown('sd')" class="w-full flex justify-between items-center py-3 px-3 rounded-md text-white hover:bg-cyan-500/10">
                     <span class="flex items-center space-x-4"><i class="fas fa-university w-5 text-cyan-400"></i><span class="font-medium">School/Dept</span></span>
                    <i class="fas fa-chevron-down text-sm transition-transform" :class="{ 'rotate-180': activeDropdown === 'sd' }"></i>
                </button>
                <div x-show="activeDropdown === 'sd'" class="ml-9 mt-2 space-y-2 border-l-2 border-cyan-500/20 pl-4">
                    <a href="ADD_SD_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-cyan-500/10 hover:text-white">Add School/Dept</a>
                    <a href="MANAGE_SD_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-cyan-500/10 hover:text-white">Manage School/Dept</a>
                </div>
            </div>
            <div>
                <button @click="toggleDropdown('emp')" class="w-full flex justify-between items-center py-3 px-3 rounded-md text-white hover:bg-cyan-500/10">
                     <span class="flex items-center space-x-4"><i class="fas fa-users w-5 text-cyan-400"></i><span class="font-medium">Employee Details</span></span>
                    <i class="fas fa-chevron-down text-sm transition-transform" :class="{ 'rotate-180': activeDropdown === 'emp' }"></i>
                </button>
                <div x-show="activeDropdown === 'emp'" class="ml-9 mt-2 space-y-2 border-l-2 border-cyan-500/20 pl-4">
                    <a href="ADD_EMPLOYEE_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-cyan-500/10 hover:text-white">Add Employee</a>
                    <a href="MANAGE_EMPLOYEE_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-cyan-500/10 hover:text-white">View Employees</a>
                </div>
            </div>
            <div class="border-t border-white/10 mt-4 pt-4">
                <button onclick="logout()" class="w-full flex items-center space-x-4 py-3 px-3 rounded-md text-red-400 hover:bg-red-500/20">
                    <i class="fas fa-sign-out-alt w-5"></i><span class="font-medium">Logout</span>
                </button>
            </div>
        </div>
    </div>
</div>
`;

const facultyNavbarTemplate = `
<div x-data="navbarData()" @click.away="closeAllDropdowns()">
    <div class="sticky top-0 z-50">
        <header class="bg-slate-900 bg-opacity-75 backdrop-blur-sm text-white shadow-lg border-b border-white/10">
            <div class="container mx-auto px-4">
                <div class="flex items-center justify-between py-3">
                    <div class="flex items-center space-x-4 min-w-0">
                        <div class="h-12 w-12 sm:h-14 sm:w-14 rounded-full overflow-hidden flex-shrink-0 border-2 border-white/20">
                            <img src="LOGO_LINK" alt="Logo" class="w-full h-full object-contain bg-slate-800 p-1">
                        </div>
                        <div>
                            <h1 class="text-sm sm:text-lg lg:text-xl font-semibold leading-tight tracking-wide">PONDICHERRY UNIVERSITY</h1>
                            <div class="text-xs text-gray-400 opacity-90" id="user-role-title">User Panel</div>
                        </div>
                    </div>
                    <div class="hidden xl:flex items-center space-x-4">
                        <span class="text-lg font-medium" id="user-role-desktop">USER</span>
                        <span class="text-lg text-gray-600">|</span>
                        <button onclick="logout()" class="text-lg font-medium hover:text-red-400 transition-colors duration-200 flex items-center space-x-2">
                            <span>LOGOUT</span><i class="fas fa-sign-out-alt"></i>
                        </button>
                    </div>
                    <button @click="toggleMobileMenu()" class="xl:hidden p-2 rounded-md hover:bg-white/10 focus:outline-none">
                        <i class="fas h-6 w-6" :class="mobileMenuOpen ? 'fa-times' : 'fa-bars'"></i>
                    </button>
                </div>
            </div>
        </header>

        <nav class="bg-slate-800 bg-opacity-60 backdrop-blur-sm text-white shadow-md hidden xl:block">
            <div class="container mx-auto px-4">
                <div class="flex justify-center items-center space-x-2">
                    <a href="DASHBOARD_LINK" class="nav-item text-base font-medium hover:bg-cyan-500/10 text-gray-200 px-4 pt-3 pb-2 transition-all duration-200" data-page-group="dashboard">DASHBOARD</a>
                    <div class="relative" x-data="{ open: false }" @click.away="open = false">
                        <button @click="open = !open" class="nav-item text-base font-medium hover:bg-cyan-500/10 text-gray-200 px-4 pt-3 pb-2 transition-all duration-200 flex items-center" data-page-group="booking">BOOK THE HALL <i class="fas fa-chevron-down text-xs ml-2 transition-transform" :class="{ 'rotate-180': open }"></i></button>
                        <div x-show="open" x-transition class="absolute mt-2 w-56 bg-slate-800/95 backdrop-blur-md border border-white/10 rounded-lg shadow-xl py-2 z-20">
                            <a href="BOOK_AND_BROWSE_LINK" class="block px-4 py-2 text-sm text-gray-200 hover:bg-cyan-500/20 hover:text-white">Browse & Book Hall</a>
                            <a href="MY_BOOKINGS_LINK" class="block px-4 py-2 text-sm text-gray-200 hover:bg-cyan-500/20 hover:text-white">My Bookings</a>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    </div>

    <div x-show="mobileMenuOpen" x-transition:enter="transition ease-out duration-300" x-transition:enter-start="opacity-0 -translate-y-4" x-transition:enter-end="opacity-100 translate-y-0" x-transition:leave="transition ease-in duration-200" x-transition:leave-start="opacity-100 translate-y-0" x-transition:leave-end="opacity-0 -translate-y-4" class="xl:hidden bg-slate-900/95 backdrop-blur-sm border-t border-white/10 fixed top-[76px] left-0 right-0 z-40 max-h-[calc(100vh-76px)] overflow-y-auto">
        <div class="px-4 py-4 space-y-2">
            <a href="DASHBOARD_LINK" @click="closeMobileMenu()" class="flex items-center space-x-4 py-3 px-3 rounded-md text-white hover:bg-cyan-500/10">
                <i class="fas fa-tachometer-alt w-5 text-cyan-400"></i><span class="font-medium">Dashboard</span>
            </a>
            <div>
                <button @click="toggleDropdown('booking')" class="w-full flex justify-between items-center py-3 px-3 rounded-md text-white hover:bg-cyan-500/10">
                    <span class="flex items-center space-x-4"><i class="fas fa-calendar-check w-5 text-cyan-400"></i><span class="font-medium">Book The Hall</span></span>
                    <i class="fas fa-chevron-down text-sm transition-transform" :class="{ 'rotate-180': activeDropdown === 'booking' }"></i>
                </button>
                <div x-show="activeDropdown === 'booking'" class="ml-9 mt-2 space-y-2 border-l-2 border-cyan-500/20 pl-4">
                    <a href="BOOK_AND_BROWSE_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-cyan-500/10 hover:text-white">Browse & Book Hall</a>
                    <a href="MY_BOOKINGS_LINK" @click="closeMobileMenu()" class="block py-2 px-3 rounded-md text-gray-300 hover:bg-cyan-500/10 hover:text-white">My Bookings</a>
                </div>
            </div>
            <div class="border-t border-white/10 mt-4 pt-4">
                <button onclick="logout()" class="w-full flex items-center space-x-4 py-3 px-3 rounded-md text-red-400 hover:bg-red-500/20">
                    <i class="fas fa-sign-out-alt w-5"></i><span class="font-medium">Logout</span>
                </button>
            </div>
        </div>
    </div>
</div>
`;

const footerTemplate = `
<footer class="bg-slate-900 bg-opacity-75 backdrop-blur-sm text-center p-4 mt-auto border-t border-white/10">
    <p class="text-sm text-gray-400">&copy; ${new Date().getFullYear()} Pondicherry University. All rights reserved.</p>
</footer>
`;


// --- 2. HELPER FUNCTIONS ---

function getUserRole() {
    const token = sessionStorage.getItem('roleToken');
    if (!token) { return null; }
    if (token.includes('.')) {
        try {
            const decoded = JSON.parse(atob(token.split('.')[1]));
            return decoded && decoded.role ? decoded.role.toUpperCase() : null;
        } catch (e) { return null; }
    } else {
        return token.toUpperCase();
    }
}

function highlightActiveLink() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const pageMap = {
        "admin.html": "admin", "addHall.html": "hall", "manageHall.html": "hall",
        "addSD.html": "sd", "manageSD.html": "sd", "employee.html": "employee",
        "manageEmployee.html": "employee", "faculty.html": "dashboard", "hod.html": "dashboard",
        "bookBrowse.html": "booking", "bookings.html": "booking"
    };
    const activeGroup = pageMap[currentPath];
    document.querySelectorAll('.nav-item').forEach(link => {
        const pageGroup = link.dataset.pageGroup || link.dataset.page;
        if (pageGroup === activeGroup) {
            link.classList.add('border-b-2', 'border-cyan-400', 'text-white');
            link.classList.remove('text-gray-200', 'pb-2');
            link.classList.add('pb-[6px]');
        }
    });
}


// --- 3. MAIN LAYOUT LOADER ---

function loadLayout() {
    if (typeof AppConfig === 'undefined') {
        console.error('CRITICAL: AppConfig is not defined. Load config.js first.');
        return;
    }

    const role = getUserRole();
    let navTemplate = '';
    let replacements = {};

    switch (role) {
        case 'ADMIN':
            navTemplate = adminNavbarTemplate;
            replacements = {
                'LOGO_LINK': AppConfig.links.logo, 'ADMIN_DASH_LINK': AppConfig.links.adminDash,
                'ADD_HALL_LINK': AppConfig.links.addHall, 'MANAGE_HALL_LINK': AppConfig.links.manageHall,
                'ADD_SD_LINK': AppConfig.links.addSD, 'MANAGE_SD_LINK': AppConfig.links.manageSD,
                'ADD_EMPLOYEE_LINK': AppConfig.links.employee, 'MANAGE_EMPLOYEE_LINK': AppConfig.links.manageEMP,
            };
            break;
        case 'FACULTY':
        case 'HOD':
            navTemplate = facultyNavbarTemplate;
            replacements = {
                'LOGO_LINK': AppConfig.links.logo,
                'DASHBOARD_LINK': role === 'HOD' ? AppConfig.links.hodDash : AppConfig.links.facultyDash,
                'BOOK_AND_BROWSE_LINK': AppConfig.links.bookAndBrowse, 'MY_BOOKINGS_LINK': AppConfig.links.myBookings,
            };
            break;
        default:
            logout();
            return;
    }

    let populatedNavHtml = navTemplate;
    for (const placeholder in replacements) {
        populatedNavHtml = populatedNavHtml.replace(new RegExp(placeholder, 'g'), replacements[placeholder]);
    }

    const navContainer = document.getElementById('nav-placeholder');
    if (navContainer) {
        navContainer.innerHTML = populatedNavHtml;
        const roleDisplay = navContainer.querySelector('#user-role-desktop');
        if(roleDisplay) roleDisplay.textContent = role;
        if (window.Alpine) { window.Alpine.initTree(navContainer); }
        highlightActiveLink();
    } else {
        console.error("The '#nav-placeholder' div was not found.");
    }
    
    const footerContainer = document.getElementById('footer-placeholder');
    if(footerContainer){
        footerContainer.innerHTML = footerTemplate;
    } else {
        console.warn("The '#footer-placeholder' div was not found.");
    }
}


// --- 4. ALPINE.JS DATA ---

function navbarData() {
    return {
        mobileMenuOpen: false,
        activeDropdown: null,
        toggleMobileMenu() { this.mobileMenuOpen = !this.mobileMenuOpen; if (!this.mobileMenuOpen) this.activeDropdown = null; },
        closeMobileMenu() { this.mobileMenuOpen = false; this.activeDropdown = null; },
        toggleDropdown(dropdown) { this.activeDropdown = this.activeDropdown === dropdown ? null : dropdown; },
        closeAllDropdowns() { this.activeDropdown = null; }
    };
}


// --- 5. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', loadLayout);
