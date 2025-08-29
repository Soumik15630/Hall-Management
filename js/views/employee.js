// Employee View Module
window.EmployeeView = (function() {

    // The local API Cache has been REMOVED as ApiService handles this implicitly.

    // --- STATE MANAGEMENT (Unchanged) ---
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

    // --- API & DATA HANDLING (Updated to use ApiService) ---

    // The local fetchFromAPI, fetchRawSchools, and fetchRawDepartments functions have been REMOVED.

    async function getSchoolsAndDepartments() {
        if (state.allSchools.length > 0 && state.allDepartments.length > 0) {
            return { schools: state.allSchools, departments: state.allDepartments };
        }
        // UPDATED: Now uses the centralized ApiService
        const [schools, depts] = await Promise.all([
            ApiService.organization.getSchools(),
            ApiService.organization.getDepartments()
        ]);
        state.allSchools = schools;
        state.allDepartments = depts;
        return { schools, departments: depts };
    }

    async function fetchEmployeeData() {
        // UPDATED: Now uses the centralized ApiService
        const [rawEmployees, schools, departments] = await Promise.all([
            ApiService.employees.getAll(),
            ApiService.organization.getSchools(),
            ApiService.organization.getDepartments()
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
        // UPDATED: Now uses the centralized ApiService
        return await ApiService.employees.update(id, employeeData);
    }

    async function deleteEmployees(employeeIds) {
        // UPDATED: Now uses the centralized ApiService
        const deletePromises = employeeIds.map(id =>
            ApiService.employees.delete(id)
        );
        return await Promise.all(deletePromises);
    }

    // --- FILTERING (Unchanged) ---
    function applyFiltersAndRender() {
        const { employee, designation, office, status } = state.filters;

        state.filteredEmployees = state.allEmployees.filter(emp => {
            if (employee.name && emp.name !== employee.name) return false;
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


    // --- RENDERING (Unchanged) ---
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
                <td class="py-4 pl-4 pr-3 text-sm sm:pl-6 align-top">
                    <input type="checkbox" class="row-checkbox rounded bg-slate-700 border-slate-500 text-blue-500 focus:ring-blue-500" ${isSelected ? 'checked' : ''}>
                </td>
                <td class="px-3 py-4 text-sm align-top">
                    <div class="font-medium text-blue-400">${emp.name}</div>
                    <div class="text-slate-400 text-xs break-all">${emp.email}</div>
                    <div class="text-slate-400">${emp.phone || ''}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300 align-top">${emp.designation}</td>
                <td class="px-3 py-4 text-sm align-top">
                    <div class="font-medium text-blue-400">Department</div>
                    <div class="text-slate-400">${emp.department}</div>
                    <div class="font-medium text-blue-400 mt-1">School</div>
                    <div class="text-slate-400">${emp.school}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm font-semibold ${statusColor} align-top">${emp.status}</td>
            </tr>
        `
    }).join('');

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

    // --- UI & STATE UPDATES (Unchanged) ---
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

    // --- MODAL HANDLING (Unchanged) ---
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

    function setupSearchableDropdown(inputId, optionsId, hiddenId, data, onSelect = () => {}) {
        const input = document.getElementById(inputId);
        const optionsContainer = document.getElementById(optionsId);
        const hiddenInput = document.getElementById(hiddenId);

        if (!input || !optionsContainer || !hiddenInput) return () => {};

        const populateOptions = (term = '', currentData = data) => {
            const filteredData = currentData.filter(item => item.toLowerCase().includes(term.toLowerCase()));
            optionsContainer.innerHTML = filteredData.map(item => `<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="${item}">${item}</div>`).join('');
        };

        const onInput = () => {
            populateOptions(input.value);
            if (!data.includes(input.value)) {
                hiddenInput.value = '';
            }
            onSelect(null);
        };

        const onFocus = () => {
            populateOptions(input.value);
            optionsContainer.classList.remove('hidden');
        };

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

        if (hiddenInput.value) {
            input.value = hiddenInput.value;
        }

        return (newData) => {
            data = newData;
            populateOptions(input.value, newData);
        };
    }

    async function openFilterModalFor(column) {
        let title, contentHtml;
        switch (column) {
            case 'employee':
                title = 'Filter by Employee Details';
                contentHtml = `
                    <div>
                        <label for="filter-emp-name-input" class="block text-sm font-medium mb-1">Name</label>
                        <div class="relative">
                            <input type="text" id="filter-emp-name-input" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search for an employee..." autocomplete="off">
                            <div id="filter-emp-name-options" class="absolute z-20 w-full bg-slate-900 border border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div>
                        </div>
                        <input type="hidden" id="filter-emp-name" value="${state.filters.employee.name}">
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
                const designations = [...new Set(state.allEmployees.map(e => e.designation))].sort();
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

        if (column === 'employee') {
            const employeeNames = [...new Set(state.allEmployees.map(e => e.name))].sort();
            setupSearchableDropdown('filter-emp-name-input', 'filter-emp-name-options', 'filter-emp-name', employeeNames);
        }

        if (column === 'office') {
            const { schools, departments } = await getSchoolsAndDepartments();
            const schoolNames = schools.map(s => s.school_name).sort();
            const allDepartmentNames = departments.map(d => d.department_name).sort();

            const schoolInput = document.getElementById('filter-school-input');
            const schoolHidden = document.getElementById('filter-school');
            const deptInput = document.getElementById('filter-department-input');
            const deptHidden = document.getElementById('filter-department');

            const updateDeptDropdown = setupSearchableDropdown('filter-department-input', 'filter-department-options', 'filter-department', allDepartmentNames, (selectedDeptName) => {
                if (selectedDeptName) {
                    const selectedDept = departments.find(d => d.department_name === selectedDeptName);
                    if (selectedDept) {
                        const parentSchool = schools.find(s => s.unique_id === selectedDept.school_id);
                        if (parentSchool && schoolInput.value !== parentSchool.school_name) {
                            schoolInput.value = parentSchool.school_name;
                            schoolHidden.value = parentSchool.school_name;
                        }
                    }
                }
            });

            const updateSchoolDropdown = setupSearchableDropdown('filter-school-input', 'filter-school-options', 'filter-school', schoolNames, (selectedSchoolName) => {
                deptInput.value = '';
                deptHidden.value = '';

                if (selectedSchoolName) {
                    const selectedSchool = schools.find(s => s.school_name === selectedSchoolName);
                    if (selectedSchool) {
                        const relevantDepts = departments
                            .filter(d => d.school_id === selectedSchool.unique_id)
                            .map(d => d.department_name)
                            .sort();
                        updateDeptDropdown(relevantDepts);
                    }
                } else {
                    updateDeptDropdown(allDepartmentNames);
                }
            });

            const initialSchool = schoolHidden.value;
            if(initialSchool) {
                 const selectedSchool = schools.find(s => s.school_name === initialSchool);
                 if(selectedSchool) {
                     const relevantDepts = departments
                        .filter(d => d.school_id === selectedSchool.unique_id)
                        .map(d => d.department_name)
                        .sort();
                     updateDeptDropdown(relevantDepts);
                 }
            }
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

            await getSchoolsAndDepartments();

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
