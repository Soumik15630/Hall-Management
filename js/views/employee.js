// Employee View Module
window.EmployeeView = (function() {
    
    // --- START: Simple API Cache ---
    window.apiCache = window.apiCache || {
        _data: {},
        _promises: {},
        fetch: async function(key, fetcherFn) {
            if (this._data[key]) return this._data[key];
            if (!this._promises[key]) {
                this._promises[key] = fetcherFn().then(data => {
                    this._data[key] = data;
                    delete this._promises[key];
                    return data;
                }).catch(err => {
                    delete this._promises[key];
                    throw err;
                });
            }
            return this._promises[key];
        }
    };
    // --- END: Simple API Cache ---

    // --- STATE MANAGEMENT ---
    const defaultFilters = () => ({
        employee: { name: '', email: '', phone: '' },
        designation: '',
        office: { school: '', department: '' },
        status: ''
    });

    let state = {
        allEmployees: [],
        filteredEmployees: [],
        allSchools: [],
        allDepartments: [],
        selectedRows: [],
        multiSelection: false,
        filters: defaultFilters(),
        modalState: {
            employeeId: null,
            belongsTo: 'ADMINISTRATION',
            schoolId: null,
            departmentId: null,
            section: null,
            schoolSearchTerm: '',
            departmentSearchTerm: ''
        }
    };
    let abortController;
    let confirmationCallback = null;

    // --- API & DATA HANDLING ---
    async function fetchFromAPI(endpoint, options = {}, isJson = true) {
        const headers = getAuthHeaders();
        if (!headers) {
            logout();
            throw new Error("User not authenticated");
        }
        const fullUrl = AppConfig.apiBaseUrl + endpoint;
        const config = { ...options, headers };
        if (options.body && !config.headers['Content-Type']) {
            config.headers['Content-Type'] = 'application/json';
        }
        const response = await fetch(fullUrl, config);
        if (!response.ok) {
            const errorText = await response.text();
             try {
                const errorJson = JSON.parse(errorText);
                console.error('API Error Response:', errorJson);
                const errorMessages = errorJson.error.map(e => `${e.path.join('.')} - ${e.message}`).join('\n');
                throw new Error(`API Error: ${response.status}\n${errorMessages}`);
            } catch (e) {
                 throw new Error(`API Error on ${endpoint}: ${response.status} - ${errorText}`);
            }
        }
        if (isJson) {
            const text = await response.text();
            if (!text) return null;
            const result = JSON.parse(text);
            return result.data || result;
        }
        return response;
    }

    async function fetchRawSchools() {
        return await window.apiCache.fetch('schools', () => fetchFromAPI(AppConfig.endpoints.allschool));
    }

    async function fetchRawDepartments() {
        return await window.apiCache.fetch('departments', () => fetchFromAPI(AppConfig.endpoints.alldept));
    }

    async function fetchEmployeeData() {
        const [rawEmployees, schools, departments] = await Promise.all([
            fetchFromAPI(AppConfig.endpoints.allemp),
            fetchRawSchools(),
            fetchRawDepartments()
        ]);
        
        const schoolMap = new Map(schools.map(s => [s.unique_id, s.school_name]));
        const departmentMap = new Map(departments.map(d => [d.unique_id, d.department_name]));

        return rawEmployees.map(emp => ({
            id: emp.unique_id,
            name: emp.employee_name,
            email: emp.employee_email,
            phone: emp.employee_mobile,
            designation: emp.designation,
            department: departmentMap.get(emp.department_id) || 'N/A',
            school: schoolMap.get(emp.school_id) || 'N/A',
            status: emp.status || 'ACTIVE',
            raw_belongs_to: emp.belongs_to,
            raw_school_id: emp.school_id,
            raw_department_id: emp.department_id,
            raw_section: emp.section
        }));
    }

    async function updateEmployee(id, employeeData) {
         return await fetchFromAPI(`${AppConfig.endpoints.emp}/${id}`, { method: 'PUT', body: JSON.stringify(employeeData) });
    }

    async function deleteEmployees(employeeIds) {
        const deletePromises = employeeIds.map(id => 
            fetchFromAPI(`${AppConfig.endpoints.emp}/${id}`, { method: 'DELETE' }, false)
        );
        return await Promise.all(deletePromises);
    }
    
    // --- FILTERING ---
    function applyFiltersAndRender() {
        const { employee, designation, office, status } = state.filters;

        state.filteredEmployees = state.allEmployees.filter(emp => {
            if (employee.name && !emp.name.toLowerCase().includes(employee.name.toLowerCase())) return false;
            if (employee.email && !emp.email.toLowerCase().includes(employee.email.toLowerCase())) return false;
            if (employee.phone && !emp.phone.toLowerCase().includes(employee.phone.toLowerCase())) return false;
            if (designation && emp.designation !== designation) return false;
            if (office.school && emp.school !== office.school) return false;
            if (office.department && emp.department !== office.department) return false;
            if (status && emp.status !== status) return false;
            return true;
        });

        renderEmployeeTable();
    }


    // --- RENDERING ---
    function renderEmployeeTable() {
        const tableBody = document.getElementById('employee-details-body');
        if (!tableBody) return;

        if (!state.filteredEmployees || state.filteredEmployees.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-slate-400">No employee details match the current filters.</td></tr>`;
            return;
        }
        
        const tableHtml = state.filteredEmployees.map(emp => {
            const isSelected = state.selectedRows.includes(emp.id);
            const statusColor = emp.status === 'ACTIVE' ? 'text-green-400' : 'text-red-400';
            return `
            <tr data-employee-id="${emp.id}" class="${isSelected ? 'bg-blue-900/30' : ''} hover:bg-slate-800/50 transition-colors">
                <td class="py-4 pl-4 pr-3 text-sm sm:pl-6">
                    <input type="checkbox" class="row-checkbox rounded bg-slate-700 border-slate-500 text-blue-500 focus:ring-blue-500" ${isSelected ? 'checked' : ''}>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">${emp.name}</div>
                    <div class="text-slate-400">${emp.email}</div>
                    <div class="text-slate-400">${emp.phone || ''}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${emp.designation}</td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">Department</div>
                    <div class="text-slate-400">${emp.department}</div>
                    <div class="font-medium text-blue-400 mt-1">School</div>
                    <div class="text-slate-400">${emp.school}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm font-semibold ${statusColor}">${emp.status}</td>
            </tr>
        `}).join('');

        tableBody.innerHTML = tableHtml;
        updateActionButtonsState();
        updateFilterIcons();
        if(window.lucide) lucide.createIcons();
    }

    function updateFilterIcons() {
        document.querySelectorAll('#employee-details-view .filter-icon').forEach(icon => {
            const column = icon.dataset.filterColumn;
            let isActive = false;
            switch(column) {
                case 'employee': isActive = state.filters.employee.name || state.filters.employee.email || state.filters.employee.phone; break;
                case 'designation': isActive = !!state.filters.designation; break;
                case 'office': isActive = state.filters.office.school || state.filters.office.department; break;
                case 'status': isActive = !!state.filters.status; break;
            }
            icon.classList.toggle('text-blue-400', isActive);
            icon.classList.toggle('text-slate-400', !isActive);
        });
    }

    // --- UI & STATE UPDATES ---
    function updateActionButtonsState() {
        const selectedCount = state.selectedRows.length;
        const modifyBtn = document.getElementById('modify-employee-btn');
        const deleteBtn = document.getElementById('delete-employee-btn');
        const selectAllCheckbox = document.getElementById('select-all-employee-checkbox');
        
        if(modifyBtn) modifyBtn.disabled = selectedCount !== 1;
        if(deleteBtn) deleteBtn.disabled = selectedCount === 0;
        
        if (selectAllCheckbox) {
            selectAllCheckbox.disabled = !state.multiSelection;
            selectAllCheckbox.checked = state.multiSelection && selectedCount > 0 && selectedCount === state.filteredEmployees.length;
        }
    }

    function handleRowSelection(employeeId, isChecked) {
        if (!state.multiSelection) {
            state.selectedRows = isChecked ? [employeeId] : [];
        } else {
            if (isChecked && !state.selectedRows.includes(employeeId)) {
                state.selectedRows.push(employeeId);
            } else if (!isChecked) {
                state.selectedRows = state.selectedRows.filter(id => id !== employeeId);
            }
        }
        renderEmployeeTable();
    }

    // --- MODAL HANDLING ---
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        const backdrop = document.getElementById('modal-backdrop');
        if (!modal || !backdrop) return;
        backdrop.classList.remove('hidden', 'opacity-0');
        modal.classList.remove('hidden', 'opacity-0');
        modal.querySelector('.modal-content')?.classList.remove('scale-95');
    }

    function closeModal() {
        const backdrop = document.getElementById('modal-backdrop');
        const modals = document.querySelectorAll('.modal');
        backdrop?.classList.add('opacity-0');
        modals.forEach(modal => {
            modal.classList.add('opacity-0');
            modal.querySelector('.modal-content')?.classList.add('scale-95');
        });
        setTimeout(() => {
            backdrop?.classList.add('hidden');
            modals.forEach(modal => {
                 if (modal.id.startsWith('filter-modal-')) {
                    modal.remove();
                } else {
                    modal.classList.add('hidden');
                }
            });
        }, 300);
        confirmationCallback = null;
    }
    
    function createFilterModal(column, title, contentHtml) {
        const container = document.getElementById('filter-modal-container');
        if (!container) return;

        const modalId = `filter-modal-${column}`;
        const existingModal = document.getElementById(modalId);
        if (existingModal) existingModal.remove();

        const modalHtml = `
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
        </div>
        `;
        container.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    function setupSearchableDropdown(inputId, optionsId, hiddenId, data) {
        const input = document.getElementById(inputId);
        const optionsContainer = document.getElementById(optionsId);
        const hiddenInput = document.getElementById(hiddenId);

        if (!input || !optionsContainer || !hiddenInput) return;

        const populateOptions = (term = '') => {
            const filteredData = data.filter(item => item.toLowerCase().includes(term.toLowerCase()));
            optionsContainer.innerHTML = filteredData.map(item => `<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="${item}">${item}</div>`).join('');
        };

        input.addEventListener('focus', () => {
            populateOptions(input.value);
            optionsContainer.classList.remove('hidden');
        });

        input.addEventListener('input', () => populateOptions(input.value));

        optionsContainer.addEventListener('mousedown', e => {
            const { value } = e.target.dataset;
            if (value) {
                hiddenInput.value = value;
                input.value = value;
                optionsContainer.classList.add('hidden');
            }
        });

        input.addEventListener('blur', () => setTimeout(() => optionsContainer.classList.add('hidden'), 150));
        
        if (hiddenInput.value) {
            input.value = hiddenInput.value;
        }
    }

    async function openFilterModalFor(column) {
        let title, contentHtml;
        switch (column) {
            case 'employee':
                title = 'Filter by Employee Details';
                contentHtml = `
                    <div>
                        <label for="filter-emp-name" class="block text-sm font-medium mb-1">Name</label>
                        <input type="text" id="filter-emp-name" value="${state.filters.employee.name}" placeholder="Contains..." class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <div>
                        <label for="filter-emp-email" class="block text-sm font-medium mb-1">Email</label>
                        <input type="text" id="filter-emp-email" value="${state.filters.employee.email}" placeholder="Contains..." class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <div>
                        <label for="filter-emp-phone" class="block text-sm font-medium mb-1">Phone</label>
                        <input type="text" id="filter-emp-phone" value="${state.filters.employee.phone}" placeholder="Contains..." class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                    </div>`;
                break;
            case 'designation':
                title = 'Filter by Designation';
                const designations = [...new Set(state.allEmployees.map(e => e.designation))];
                const designationOptions = designations.map(d => `<option value="${d}" ${state.filters.designation === d ? 'selected' : ''}>${d}</option>`).join('');
                contentHtml = `
                    <select id="filter-designation" class="glowing-select w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                        <option value="">Any</option>
                        ${designationOptions}
                    </select>`;
                break;
            case 'office':
                title = 'Filter by Office';
                contentHtml = `
                    <div>
                        <label for="filter-school-input" class="block text-sm font-medium mb-1">School</label>
                        <div class="relative">
                            <input type="text" id="filter-school-input" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search for a school..." autocomplete="off">
                            <div id="filter-school-options" class="absolute z-20 w-full bg-slate-900 border border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div>
                        </div>
                        <input type="hidden" id="filter-school" value="${state.filters.office.school}">
                    </div>
                    <div>
                        <label for="filter-department-input" class="block text-sm font-medium mb-1">Department</label>
                        <div class="relative">
                            <input type="text" id="filter-department-input" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search for a department..." autocomplete="off">
                            <div id="filter-department-options" class="absolute z-10 w-full bg-slate-900 border border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div>
                        </div>
                        <input type="hidden" id="filter-department" value="${state.filters.office.department}">
                    </div>`;
                break;
            case 'status':
                title = 'Filter by Status';
                contentHtml = `
                    <fieldset class="flex gap-6">
                        <label class="flex items-center"><input type="radio" name="filter-status-option" value="" ${state.filters.status === '' ? 'checked' : ''} class="form-radio h-4 w-4 bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500 mr-2">Any</label>
                        <label class="flex items-center"><input type="radio" name="filter-status-option" value="ACTIVE" ${state.filters.status === 'ACTIVE' ? 'checked' : ''} class="form-radio h-4 w-4 bg-slate-700 border-slate-600 text-green-500 focus:ring-green-500 mr-2">Active</label>
                        <label class="flex items-center"><input type="radio" name="filter-status-option" value="INACTIVE" ${state.filters.status === 'INACTIVE' ? 'checked' : ''} class="form-radio h-4 w-4 bg-slate-700 border-slate-600 text-red-500 focus:ring-red-500 mr-2">Inactive</label>
                    </fieldset>`;
                break;
        }
        createFilterModal(column, title, contentHtml);
        
        if (column === 'office') {
            const { schools, departments } = await getSchoolsAndDepartments();
            const schoolNames = schools.map(s => s.school_name);
            setupSearchableDropdown('filter-school-input', 'filter-school-options', 'filter-school', schoolNames);
            const departmentNames = departments.map(d => d.department_name);
            setupSearchableDropdown('filter-department-input', 'filter-department-options', 'filter-department', departmentNames);
        }
        
        openModal(`filter-modal-${column}`);
    }

    function handleApplyFilter(column) {
        const form = document.getElementById(`filter-form-${column}`);
        if (!form) return;

        switch (column) {
            case 'employee':
                state.filters.employee.name = form.querySelector('#filter-emp-name').value;
                state.filters.employee.email = form.querySelector('#filter-emp-email').value;
                state.filters.employee.phone = form.querySelector('#filter-emp-phone').value;
                break;
            case 'designation':
                state.filters.designation = form.querySelector('#filter-designation').value;
                break;
            case 'office':
                state.filters.office.school = form.querySelector('#filter-school').value;
                state.filters.office.department = form.querySelector('#filter-department').value;
                break;
            case 'status':
                state.filters.status = form.querySelector('input[name="filter-status-option"]:checked').value;
                break;
        }
        applyFiltersAndRender();
        closeModal();
    }

    function handleClearFilter(column) {
        state.filters[column] = defaultFilters()[column];
        applyFiltersAndRender();
        closeModal();
    }


    function showConfirmation(title, message, onConfirm) {
        document.getElementById('confirmation-title').textContent = title;
        document.getElementById('confirmation-message').textContent = message;
        confirmationCallback = onConfirm;
        openModal('confirmation-modal');
    }

    function setupUpdateEmployeeModal() {
        const employee = state.allEmployees.find(emp => emp.id === state.selectedRows[0]);
        if (!employee) return;

        state.modalState = {
            employeeId: employee.id,
            belongsTo: employee.raw_belongs_to || 'ADMINISTRATION',
            schoolId: employee.raw_school_id,
            departmentId: employee.raw_department_id,
            section: employee.raw_section,
            schoolSearchTerm: employee.school,
            departmentSearchTerm: employee.department
        };

        document.getElementById('update-employee-name').value = employee.name;
        document.getElementById('update-employee-email').value = employee.email;
        document.getElementById('update-employee-phone').value = employee.phone || '';
        
        const designationSelect = document.getElementById('update-employee-designation-select');
        if (designationSelect) {
            designationSelect.value = employee.designation;
        }
        
        const status = employee.status || 'ACTIVE';
        const statusRadio = document.querySelector(`input[name="update-employee-status"][value="${status}"]`);
        if(statusRadio) statusRadio.checked = true;

        const belongsToSelect = document.getElementById('update-employee-belongs-to');
        belongsToSelect.value = state.modalState.belongsTo;
        belongsToSelect.dispatchEvent(new Event('change'));

        if (state.modalState.belongsTo === 'ADMINISTRATION') {
            document.getElementById('update-employee-section-select').value = state.modalState.section || '';
        } else {
            document.getElementById('update-employee-school-input').value = state.modalState.schoolSearchTerm || '';
            document.getElementById('update-employee-department-input').value = state.modalState.departmentSearchTerm || '';
        }

        openModal('update-employee-modal');
    }
    
    // --- EVENT HANDLERS ---
    async function handleUpdateSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const belongsTo = form.querySelector('#update-employee-belongs-to').value;
        
        const designation = form.querySelector('#update-employee-designation-select').value;

        const payload = {
            employee_name: form.querySelector('#update-employee-name').value,
            employee_email: form.querySelector('#update-employee-email').value,
            employee_mobile: form.querySelector('#update-employee-phone').value,
            designation: designation,
            status: form.querySelector('input[name="update-employee-status"]:checked')?.value || 'ACTIVE',
            belongs_to: belongsTo,
            school_id: (belongsTo === 'SCHOOL' || belongsTo === 'DEPARTMENT') ? state.modalState.schoolId : null,
            department_id: belongsTo === 'DEPARTMENT' ? state.modalState.departmentId : null,
            section: belongsTo === 'ADMINISTRATION' ? form.querySelector('#update-employee-section-select').value : null
        };
        
        Object.keys(payload).forEach(key => {
            if (payload[key] === null || payload[key] === '') {
                delete payload[key];
            }
        });
        
        if (belongsTo === 'ADMINISTRATION' && !payload.section) {
             payload.section = form.querySelector('#update-employee-section-select').value;
        }

        try {
            await updateEmployee(state.modalState.employeeId, payload);
            alert('Employee updated successfully!');
            closeModal();
            await initialize();
        } catch (error) {
            alert(`Update failed: ${error.message}`);
        }
    }

    async function handleDeleteConfirm() {
        try {
            await deleteEmployees(state.selectedRows);
            alert('Employee(s) deleted successfully.');
            state.selectedRows = [];
            await initialize();
        } catch (error) {
            alert(`Deletion failed: ${error.message}`);
        }
    }

    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const view = document.getElementById('employee-details-view');
        if(!view) return;

        view.addEventListener('click', e => {
            const filterIcon = e.target.closest('.filter-icon');
            if (filterIcon) {
                openFilterModalFor(filterIcon.dataset.filterColumn);
            }
            if (e.target.closest('#clear-employee-filters-btn')) {
                state.filters = defaultFilters();
                applyFiltersAndRender();
            }
        }, { signal });

        document.getElementById('filter-modal-container')?.addEventListener('click', e => {
            const button = e.target.closest('button');
            if (!button) return;
            if (button.dataset.action === 'apply-filter') handleApplyFilter(button.dataset.column);
            if (button.dataset.action === 'clear-filter') handleClearFilter(button.dataset.column);
            if (button.classList.contains('modal-close-btn')) closeModal();
        }, { signal });

        document.getElementById('employee-multiselect-toggle')?.addEventListener('change', (e) => {
            state.multiSelection = e.target.checked;
            if (!state.multiSelection) state.selectedRows = [];
            renderEmployeeTable();
        }, { signal });
        
        document.getElementById('select-all-employee-checkbox')?.addEventListener('change', (e) => {
            if (state.multiSelection) {
                state.selectedRows = e.target.checked ? state.filteredEmployees.map(emp => emp.id) : [];
                renderEmployeeTable();
            }
        }, { signal });
        
        document.getElementById('employee-details-body')?.addEventListener('change', (e) => {
            if (e.target.classList.contains('row-checkbox')) {
                const row = e.target.closest('tr');
                handleRowSelection(row.dataset.employeeId, e.target.checked);
            }
        }, { signal });

        document.getElementById('modify-employee-btn')?.addEventListener('click', () => {
            if (state.selectedRows.length === 1) setupUpdateEmployeeModal();
        }, { signal });

        document.getElementById('delete-employee-btn')?.addEventListener('click', () => {
            if (state.selectedRows.length > 0) {
                showConfirmation('Confirm Deletion', `Are you sure you want to delete ${state.selectedRows.length} employee(s)?`, handleDeleteConfirm);
            }
        }, { signal });

        document.querySelectorAll('.modal-close-btn, #confirmation-cancel-btn').forEach(btn => {
            btn.addEventListener('click', closeModal, { signal });
        });
        document.getElementById('modal-backdrop')?.addEventListener('click', closeModal, { signal });
        document.getElementById('confirmation-confirm-btn')?.addEventListener('click', () => {
            if (confirmationCallback) confirmationCallback();
            closeModal();
        }, { signal });

        document.getElementById('update-employee-form')?.addEventListener('submit', handleUpdateSubmit, { signal });

        document.getElementById('update-employee-belongs-to')?.addEventListener('change', (e) => {
            const value = e.target.value;
            state.modalState.belongsTo = value;

            const sectionContainer = document.getElementById('update-employee-section-container');
            const schoolContainer = document.getElementById('update-employee-school-container');
            const deptContainer = document.getElementById('update-employee-department-container');

            sectionContainer.style.display = 'none';
            schoolContainer.style.display = 'none';
            deptContainer.style.display = 'none';

            if (value === 'ADMINISTRATION') {
                sectionContainer.style.display = 'block';
            } else if (value === 'SCHOOL') {
                schoolContainer.style.display = 'block';
            } else if (value === 'DEPARTMENT') {
                schoolContainer.style.display = 'block';
                deptContainer.style.display = 'block';
            }
        }, { signal });
    }
    
    function cleanup() {
        if(abortController) abortController.abort();
        state = { allEmployees: [], filteredEmployees: [], allSchools: [], allDepartments: [], selectedRows: [], multiSelection: false, filters: defaultFilters(), modalState: {} };
        const multiSelectToggle = document.getElementById('employee-multiselect-toggle');
        if(multiSelectToggle) multiSelectToggle.checked = false;
        closeModal();
    }

    async function initialize() {
        try {
            const data = await fetchEmployeeData();
            state.allEmployees = data;
            state.allSchools = await fetchRawSchools();
            state.allDepartments = await fetchRawDepartments();

            applyFiltersAndRender();
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading employee details:', error);
            const tableBody = document.getElementById('employee-details-body');
            if(tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-red-400">Failed to load employee data.</td></tr>`;
        }
    }

    return {
        initialize,
        cleanup
    };
})();
