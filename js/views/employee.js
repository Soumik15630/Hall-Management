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
    let state = {
        allEmployees: [],
        allSchools: [],
        allDepartments: [],
        selectedRows: [],
        multiSelection: false,
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


    // --- RENDERING ---
    function renderEmployeeTable() {
        const tableBody = document.getElementById('employee-details-body');
        if (!tableBody) return;

        if (!state.allEmployees || state.allEmployees.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-slate-400">No employee details found.</td></tr>`;
            return;
        }
        
        const tableHtml = state.allEmployees.map(emp => {
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
            selectAllCheckbox.checked = state.multiSelection && selectedCount > 0 && selectedCount === state.allEmployees.length;
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
            modals.forEach(modal => modal.classList.add('hidden'));
        }, 300);
        confirmationCallback = null;
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

        document.getElementById('employee-multiselect-toggle')?.addEventListener('change', (e) => {
            state.multiSelection = e.target.checked;
            if (!state.multiSelection) state.selectedRows = [];
            renderEmployeeTable();
        }, { signal });
        
        document.getElementById('select-all-employee-checkbox')?.addEventListener('change', (e) => {
            if (state.multiSelection) {
                state.selectedRows = e.target.checked ? state.allEmployees.map(emp => emp.id) : [];
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
        state = { allEmployees: [], allSchools: [], allDepartments: [], selectedRows: [], multiSelection: false, modalState: {} };
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

            renderEmployeeTable();
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
