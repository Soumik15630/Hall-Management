// js/filter.js
// A centralized, reusable module for creating, managing, and handling all filter modals.
// This module consolidates logic from hallDetails, archive, employee, and all booking views.

window.FilterManager = (function() {

    // --- PRIVATE STATE & CONFIGURATION ---
    let _config = {
        containerId: 'filter-modal-container',
        onApply: () => console.warn('FilterManager: onApply callback not configured.'),
        onClear: () => console.warn('FilterManager: onClear callback not configured.'),
    };

    // --- PRIVATE HELPER FUNCTIONS ---

    function _formatTitleCase(str) {
        if (!str) return 'N/A';
        return str.replace(/_/g, ' ').replace(/\w\S*/g, txt =>
            txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
    }

    function _createModalHTML(column, title, contentHtml) {
        const modalId = `filter-modal-${column}`;
        return `
        <div id="${modalId}" class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="modal-content relative bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6 transform transition-all">
                <h3 class="text-lg font-bold text-white mb-4">${title}</h3>
                <div id="filter-form-${column}" class="space-y-4 text-slate-300">
                    ${contentHtml}
                </div>
                <div class="mt-6 flex justify-between gap-4">
                    <button data-action="clear-filter" data-column="${column}" class="px-4 py-2 text-sm font-semibold text-blue-400 hover:text-blue-300">Clear Filter</button>
                    <div class="flex gap-4">
                        <button class="modal-close-btn px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-600 hover:bg-slate-700 rounded-lg transition">Cancel</button>
                        <button data-action="apply-filter" data-column="${column}" class="glowing-btn px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">Apply</button>
                    </div>
                </div>
            </div>
        </div>`;
    }
    
    function _setupSearchableDropdown(inputId, optionsId, hiddenId, data, initialValue = '', onSelect = () => {}) {
        const input = document.getElementById(inputId);
        const optionsContainer = document.getElementById(optionsId);
        const hiddenInput = document.getElementById(hiddenId);
        if (!input || !optionsContainer || !hiddenInput) return () => {};

        hiddenInput.value = initialValue;
        if (initialValue) input.value = initialValue;

        const populateOptions = (term = '', currentData = data) => {
            const filteredData = currentData.filter(item => item.toLowerCase().includes(term.toLowerCase()));
            optionsContainer.innerHTML = filteredData.map(item => `<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="${item}">${item}</div>`).join('');
        };

        const onFocus = () => { populateOptions(input.value); optionsContainer.classList.remove('hidden'); };
        const onInput = () => { populateOptions(input.value); if (!data.includes(input.value)) { hiddenInput.value = ''; } onSelect(null); };
        const onMouseDown = e => {
            const { value } = e.target.dataset;
            if (value) {
                hiddenInput.value = value;
                input.value = value;
                optionsContainer.classList.add('hidden');
                onSelect(value);
            }
        };
        const onBlur = () => setTimeout(() => optionsContainer.classList.add('hidden'), 150);

        input.addEventListener('focus', onFocus);
        input.addEventListener('input', onInput);
        optionsContainer.addEventListener('mousedown', onMouseDown);
        input.addEventListener('blur', onBlur);

        return (newData) => { data = newData; populateOptions(input.value, newData); };
    }


    // --- MODAL CONTENT GENERATION ---
    function _generateModalContent(column, context) {
        const { currentFilters = {}, allData = {} } = context;
        let title, contentHtml;
        const get = (path) => path.split('.').reduce((obj, key) => obj && obj[key], currentFilters);

        switch (column) {
            case 'date': case 'bookedOn': case 'dateTime':
                const dateKey = { date: 'date', bookedOn: 'bookedOn', dateTime: 'dateTime' }[column];
                title = `Filter by ${_formatTitleCase(column)} Date`;
                contentHtml = `<div class="grid grid-cols-2 gap-4">
                    <div><label for="filter-from-date" class="block text-sm font-medium mb-1">From</label><input type="date" id="filter-from-date" value="${get(`${dateKey}.from`) || ''}" class="glowing-input w-full bg-slate-700 border-slate-600 rounded-lg px-3 py-2 text-white"></div>
                    <div><label for="filter-to-date" class="block text-sm font-medium mb-1">To</label><input type="date" id="filter-to-date" value="${get(`${dateKey}.to`) || ''}" class="glowing-input w-full bg-slate-700 border-slate-600 rounded-lg px-3 py-2 text-white"></div>
                </div>`;
                break;

            case 'hall':
                title = 'Filter by Hall Details';
                const hallTypes = [...new Set((allData.halls || allData.bookings || []).map(item => item.hall?.type || item.type).filter(Boolean))];
                const hallTypeOptions = hallTypes.map(s => `<option value="${s}" ${get('hall.type') === s ? 'selected' : ''}>${_formatTitleCase(s)}</option>`).join('');
                contentHtml = `
                    <div><label for="filter-hall-name-input" class="block text-sm font-medium mb-1">Hall Name</label><div class="relative"><input type="text" id="filter-hall-name-input" class="glowing-input w-full" placeholder="Search..." autocomplete="off"><div id="filter-hall-name-options" class="absolute z-20 w-full bg-slate-900 border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div></div><input type="hidden" id="filter-hall-name" value="${get('hall.name') || ''}"></div>
                    <div><label for="filter-hall-capacity" class="block text-sm font-medium mb-1">Minimum Capacity</label><input type="number" id="filter-hall-capacity" value="${get('hall.capacity') || ''}" placeholder="e.g., 50" class="glowing-input w-full"></div>
                    <div><label for="filter-hall-type" class="block text-sm font-medium mb-1">Hall Type</label><select id="filter-hall-type" class="glowing-select w-full"><option value="">Any Type</option>${hallTypeOptions}</select></div>`;
                break;

            case 'belongsTo': case 'office':
                title = 'Filter by Office';
                contentHtml = `
                    <div><label for="filter-school-input" class="block text-sm font-medium mb-1">School</label><div class="relative"><input type="text" id="filter-school-input" class="glowing-input w-full" placeholder="Search..." autocomplete="off"><div id="filter-school-options" class="absolute z-20 w-full bg-slate-900 border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div></div><input type="hidden" id="filter-school" value="${get('belongsTo.school') || get('office.school') || ''}"></div>
                    <div><label for="filter-department-input" class="block text-sm font-medium mb-1">Department</label><div class="relative"><input type="text" id="filter-department-input" class="glowing-input w-full" placeholder="Search..." autocomplete="off"><div id="filter-department-options" class="absolute z-10 w-full bg-slate-900 border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div></div><input type="hidden" id="filter-department" value="${get('belongsTo.department') || get('office.department') || ''}"></div>`;
                break;

            case 'features':
                title = 'Filter by Features';
                const allFeatures = ['AC', 'PROJECTOR', 'WIFI', 'SMART_BOARD', 'COMPUTER', 'AUDIO_SYSTEM', 'PODIUM', 'WHITE_BOARD', 'BLACK_BOARD', 'LIFT', 'RAMP'].sort();
                const featureCheckboxes = allFeatures.map(f => `<label class="flex items-center"><input type="checkbox" value="${f}" class="feature-filter-cb" ${get('features')?.includes(f) ? 'checked' : ''}>${_formatTitleCase(f)}</label>`).join('');
                contentHtml = `<div class="grid grid-cols-2 gap-2">${featureCheckboxes}</div>`;
                break;

            case 'incharge':
                title = 'Filter by Incharge Name';
                contentHtml = `<div><label for="filter-incharge-name-input" class="block text-sm font-medium mb-1">Incharge Name</label><div class="relative"><input type="text" id="filter-incharge-name-input" class="glowing-input w-full" placeholder="Search..." autocomplete="off"><div id="filter-incharge-name-options" class="absolute z-20 w-full bg-slate-900 border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div></div><input type="hidden" id="filter-incharge-name" value="${get('incharge.name') || ''}"></div>`;
                break;

            case 'employee':
                title = 'Filter by Employee Details';
                contentHtml = `
                    <div><label for="filter-emp-name-input" class="block text-sm font-medium mb-1">Name</label><div class="relative"><input type="text" id="filter-emp-name-input" class="glowing-input w-full" placeholder="Search..." autocomplete="off"><div id="filter-emp-name-options" class="absolute z-20 w-full bg-slate-900 border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div></div><input type="hidden" id="filter-emp-name" value="${get('employee.name') || ''}"></div>
                    <div><label for="filter-emp-email" class="block text-sm font-medium mb-1">Email</label><input type="text" id="filter-emp-email" value="${get('employee.email') || ''}" placeholder="Contains..." class="glowing-input w-full"></div>
                    <div><label for="filter-emp-phone" class="block text-sm font-medium mb-1">Phone</label><input type="text" id="filter-emp-phone" value="${get('employee.phone') || ''}" placeholder="Contains..." class="glowing-input w-full"></div>`;
                break;

            case 'designation':
                title = 'Filter by Designation';
                const designations = [...new Set((allData.employees || []).map(e => e.designation))].sort();
                const designationOptions = designations.map(d => `<option value="${d}" ${get('designation') === d ? 'selected' : ''}>${d}</option>`).join('');
                contentHtml = `<select id="filter-designation" class="glowing-select w-full"><option value="">Any</option>${designationOptions}</select>`;
                break;

            case 'purpose':
                title = 'Filter by Purpose';
                contentHtml = `<div><label for="filter-purpose" class="block text-sm font-medium mb-1">Purpose contains</label><input type="text" id="filter-purpose" value="${get('purpose') || ''}" placeholder="e.g., Meeting" class="glowing-input w-full"></div>`;
                break;

            case 'bookedBy':
                title = 'Filter by User';
                contentHtml = `<div><label for="filter-user-name-input" class="block text-sm font-medium mb-1">User Name</label><div class="relative"><input type="text" id="filter-user-name-input" class="glowing-input w-full" placeholder="Search..." autocomplete="off"><div id="filter-user-name-options" class="absolute z-20 w-full bg-slate-900 border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div></div><input type="hidden" id="filter-user-name" value="${get('bookedBy.name') || ''}"></div>`;
                break;

            case 'status':
                title = 'Filter by Status';
                const isHallStatus = allData.halls && !allData.bookings; // Differentiate between hall and booking status
                if (isHallStatus) {
                    contentHtml = `
                        <fieldset class="flex gap-6">
                            <label class="flex items-center"><input type="radio" name="filter-status-option" value="" ${get('status') === '' ? 'checked' : ''}>Any</label>
                            <label class="flex items-center"><input type="radio" name="filter-status-option" value="available" ${get('status') === 'available' ? 'checked' : ''}>Available</label>
                            <label class="flex items-center"><input type="radio" name="filter-status-option" value="unavailable" ${get('status') === 'unavailable' ? 'checked' : ''}>Unavailable</label>
                        </fieldset>`;
                } else {
                    const statuses = [...new Set((allData.bookings || allData.employees || []).map(b => b.status))].filter(Boolean);
                    const statusOptions = statuses.map(s => `<option value="${s}" ${get('status') === s ? 'selected' : ''}>${_formatTitleCase(s)}</option>`).join('');
                    contentHtml = `<select id="filter-status" class="glowing-select w-full"><option value="">Any Status</option>${statusOptions}</select>`;
                }
                break;

            default: return null;
        }
        return { title, contentHtml };
    }

    // --- MODAL INTERACTIVITY SETUP ---
    async function _setupModalInteractivity(column, context) {
        const { currentFilters = {}, allData = {} } = context;
        const get = (path) => path.split('.').reduce((obj, key) => obj && obj[key], currentFilters);
        
        const schools = allData.schools || [];
        const departments = allData.departments || [];
        const employees = allData.employees || [];
        const halls = allData.halls || [];
        const bookings = allData.bookings || [];
        
        switch (column) {
            case 'hall':
                const hallNames = [...new Set((halls.length ? halls : bookings).map(item => item.hall?.name || item.hallName).filter(Boolean))].sort();
                _setupSearchableDropdown('filter-hall-name-input', 'filter-hall-name-options', 'filter-hall-name', hallNames, get('hall.name'));
                break;
            case 'belongsTo': case 'office':
                const schoolNames = schools.map(s => s.school_name).sort();
                const allDeptNames = departments.map(d => d.department_name).sort();
                
                const schoolInput = document.getElementById('filter-school-input');
                const schoolHidden = document.getElementById('filter-school');
                const deptInput = document.getElementById('filter-department-input');

                const updateDeptDropdown = _setupSearchableDropdown('filter-department-input', 'filter-department-options', 'filter-department', allDeptNames, get('belongsTo.department') || get('office.department'));
                _setupSearchableDropdown('filter-school-input', 'filter-school-options', 'filter-school', schoolNames, get('belongsTo.school') || get('office.school'), (selectedSchoolName) => {
                    deptInput.value = '';
                    if (selectedSchoolName) {
                        const school = schools.find(s => s.school_name === selectedSchoolName);
                        const relevantDepts = school ? departments.filter(d => d.school_id === school.unique_id).map(d => d.department_name).sort() : [];
                        updateDeptDropdown(relevantDepts);
                    } else {
                        updateDeptDropdown(allDeptNames);
                    }
                });
                if (schoolHidden.value) schoolInput.dispatchEvent(new Event('input', { bubbles: true })); // Trigger update
                break;

            case 'incharge':
                const inchargeNames = [...new Set(halls.map(h => h.inchargeName).filter(n => n !== 'N/A'))].sort();
                _setupSearchableDropdown('filter-incharge-name-input', 'filter-incharge-name-options', 'filter-incharge-name', inchargeNames, get('incharge.name'));
                break;

            case 'employee': case 'bookedBy':
                const nameId = column === 'employee' ? 'filter-emp-name' : 'filter-user-name';
                const initialName = column === 'employee' ? get('employee.name') : get('bookedBy.name');
                const userNames = [...new Set(employees.map(e => e.employee_name))].sort();
                _setupSearchableDropdown(`${nameId}-input`, `${nameId}-options`, nameId, userNames, initialName);
                break;
        }
    }

    // --- FORM VALUE PARSING ---
    function _parseFormValues(column) {
        const form = document.getElementById(`filter-form-${column}`);
        if (!form) return {};
        let values = {};
        
        switch (column) {
            case 'date': case 'bookedOn': case 'dateTime':
                const dateKey = { date: 'date', bookedOn: 'bookedOn', dateTime: 'dateTime' }[column];
                values[dateKey] = { from: form.querySelector('#filter-from-date')?.value, to: form.querySelector('#filter-to-date')?.value };
                break;
            case 'hall':
                values.hall = { name: form.querySelector('#filter-hall-name')?.value, capacity: form.querySelector('#filter-hall-capacity')?.value, type: form.querySelector('#filter-hall-type')?.value };
                break;
            case 'belongsTo': case 'office':
                const key = column === 'belongsTo' ? 'belongsTo' : 'office';
                values[key] = { school: form.querySelector('#filter-school')?.value, department: form.querySelector('#filter-department')?.value };
                break;
            case 'features':
                values.features = Array.from(form.querySelectorAll('.feature-filter-cb:checked')).map(cb => cb.value);
                break;
            case 'incharge':
                values.incharge = { name: form.querySelector('#filter-incharge-name')?.value };
                break;
            case 'employee':
                values.employee = { name: form.querySelector('#filter-emp-name')?.value, email: form.querySelector('#filter-emp-email')?.value, phone: form.querySelector('#filter-emp-phone')?.value };
                break;
            case 'designation':
                values.designation = form.querySelector('#filter-designation')?.value;
                break;
            case 'purpose':
                values.purpose = form.querySelector('#filter-purpose')?.value;
                break;
            case 'bookedBy':
                values.bookedBy = { name: form.querySelector('#filter-user-name')?.value };
                break;
            case 'status':
                values.status = form.querySelector('input[name="filter-status-option"]:checked')?.value ?? form.querySelector('#filter-status')?.value;
                break;
        }
        return values;
    }

    // --- PUBLIC METHODS ---
    function initialize(config) {
        _config = { ..._config, ...config };
        const container = document.getElementById(_config.containerId);
        if (!container) return;
        container.addEventListener('click', e => {
            const button = e.target.closest('button');
            if (!button) return;
            const { action, column } = button.dataset;
            if (action === 'apply-filter') { _config.onApply(_parseFormValues(column)); close(); } 
            else if (action === 'clear-filter') { _config.onClear(column); close(); } 
            else if (button.classList.contains('modal-close-btn')) { close(); }
        });
    }

    async function openFilterModalFor(column, context) {
        const container = document.getElementById(_config.containerId);
        const modalElements = _generateModalContent(column, context);
        if (!container || !modalElements) return;
        container.innerHTML = _createModalHTML(column, modalElements.title, modalElements.contentHtml);
        await new Promise(resolve => setTimeout(resolve, 0));
        await _setupModalInteractivity(column, context);
        const modal = document.getElementById(`filter-modal-${column}`);
        const backdrop = document.getElementById('modal-backdrop');
        if (modal && backdrop) {
            backdrop.classList.remove('hidden', 'opacity-0');
            modal.classList.remove('hidden');
        }
    }

    function close() {
        const backdrop = document.getElementById('modal-backdrop');
        if (backdrop) {
            backdrop.classList.add('opacity-0');
            setTimeout(() => backdrop.classList.add('hidden'), 300);
        }
        document.querySelectorAll('.modal').forEach(modal => {
            if (modal.id.startsWith('filter-modal-')) modal.remove();
        });
    }

    return { initialize, openFilterModalFor, close };
})();

