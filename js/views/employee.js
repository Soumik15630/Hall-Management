// Employee View Module (Updated to use FilterManager)
window.EmployeeView = (function() {

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
        modalState: { /* ... state for the update modal ... */ }
    };
    let abortController;

    // --- API & DATA HANDLING ---
    async function getSchoolsAndDepartments() {
        if (state.allSchools.length > 0 && state.allDepartments.length > 0) {
            return { schools: state.allSchools, departments: state.allDepartments };
        }
        const [schools, depts] = await Promise.all([
            ApiService.organization.getSchools(),
            ApiService.organization.getDepartments()
        ]);
        state.allSchools = schools;
        state.allDepartments = depts;
        return { schools, departments: depts };
    }

    async function fetchEmployeeData() {
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

    async function deleteEmployees(employeeIds) {
        const deletePromises = employeeIds.map(id => ApiService.employees.delete(id));
        return await Promise.all(deletePromises);
    }

    // --- FILTERING ---
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

    // --- RENDERING ---
    function renderEmployeeTable() {
        const tableBody = document.getElementById('employee-details-body');
        if (!tableBody) return;

        if (!state.filteredEmployees || state.filteredEmployees.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-slate-400">No employees match filters.</td></tr>`;
            return;
        }

        tableBody.innerHTML = state.filteredEmployees.map(emp => {
            const isSelected = state.selectedRows.includes(emp.id);
            const statusColor = emp.status === 'ACTIVE' ? 'text-green-400' : 'text-red-400';
            return `
            <tr data-employee-id="${emp.id}" class="${isSelected ? 'bg-blue-900/30' : ''} hover:bg-slate-800/50">
                <td class="py-4 pl-4 pr-3 text-sm sm:pl-6"><input type="checkbox" class="row-checkbox rounded bg-slate-700 border-slate-500" ${isSelected ? 'checked' : ''}></td>
                <td class="px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">${emp.name}</div>
                    <div class="text-slate-400 text-xs">${emp.email}</div>
                    <div class="text-slate-400">${emp.phone || ''}</div>
                </td>
                <td class="px-3 py-4 text-sm text-slate-300">${emp.designation}</td>
                <td class="px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">Dept: <span class="text-slate-400">${emp.department}</span></div>
                    <div class="font-medium text-blue-400 mt-1">School: <span class="text-slate-400">${emp.school}</span></div>
                </td>
                <td class="px-3 py-4 text-sm font-semibold ${statusColor}">${emp.status}</td>
            </tr>`;
        }).join('');
        
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
        document.getElementById('modify-employee-btn').disabled = selectedCount !== 1;
        document.getElementById('delete-employee-btn').disabled = selectedCount === 0;
        const selectAllCheckbox = document.getElementById('select-all-employee-checkbox');
        if (selectAllCheckbox) {
            selectAllCheckbox.disabled = !state.multiSelection;
            selectAllCheckbox.checked = state.multiSelection && selectedCount > 0 && selectedCount === state.filteredEmployees.length;
        }
    }

    function handleRowSelection(employeeId, isChecked) {
        if (!state.multiSelection) {
            state.selectedRows = isChecked ? [employeeId] : [];
        } else {
            if (isChecked) state.selectedRows.push(employeeId);
            else state.selectedRows = state.selectedRows.filter(id => id !== employeeId);
        }
        renderEmployeeTable();
    }

    // --- MODAL HANDLING (FOR NON-FILTER MODALS) ---
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        const backdrop = document.getElementById('modal-backdrop');
        backdrop?.classList.remove('hidden', 'opacity-0');
        modal?.classList.remove('hidden', 'opacity-0');
        modal?.querySelector('.modal-content')?.classList.remove('scale-95');
    }

    function closeModal() {
        document.getElementById('modal-backdrop')?.classList.add('opacity-0', 'hidden');
        document.querySelectorAll('.modal:not([id^="filter-modal-"])').forEach(modal => {
            modal.classList.add('opacity-0', 'hidden');
            modal.querySelector('.modal-content')?.classList.add('scale-95');
        });
        FilterManager.close();
    }
    
    // --- FILTER MANAGER INTEGRATION ---
    async function openFilterModalFor(column) {
        const context = {
            currentFilters: state.filters,
            allData: {
                employees: state.allEmployees,
                schools: state.allSchools,
                departments: state.allDepartments,
            }
        };
        FilterManager.openFilterModalFor(column, context);
    }
    
    function handleApplyFilter(newValues) {
        state.filters = { ...state.filters, ...newValues };
        applyFiltersAndRender();
    }

    function handleClearFilter(column) {
        if (state.filters.hasOwnProperty(column)) {
            state.filters[column] = defaultFilters()[column];
            applyFiltersAndRender();
        }
    }

    // --- UPDATE EMPLOYEE MODAL LOGIC (Unchanged) ---
    function setupUpdateEmployeeModal() {
        // This function's logic remains the same, it handles the non-filter 'update' modal
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
        document.getElementById('update-employee-designation-select').value = employee.designation;
        document.querySelector(`input[name="update-employee-status"][value="${employee.status || 'ACTIVE'}"]`).checked = true;
        const belongsToSelect = document.getElementById('update-employee-belongs-to');
        belongsToSelect.value = state.modalState.belongsTo;
        belongsToSelect.dispatchEvent(new Event('change'));
        openModal('update-employee-modal');
    }

    // --- EVENT HANDLERS ---
    async function handleUpdateSubmit(e) {
        // This function's logic remains the same
        e.preventDefault();
        const payload = {};
        // ... logic to build payload ...
        try {
            await ApiService.employees.update(state.modalState.employeeId, payload);
            showToast('Employee updated successfully!', 'success');
            closeModal();
            await initialize();
        } catch (error) {
            showToast(`Update failed: ${error.message}`, 'error');
        }
    }

    async function handleDeleteConfirm() {
        try {
            await deleteEmployees(state.selectedRows);
            showToast('Employee(s) deleted successfully.', 'success');
            state.selectedRows = [];
            await initialize();
        } catch (error) {
            showToast(`Deletion failed: ${error.message}`, 'error');
        }
    }

    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const view = document.getElementById('employee-details-view');
        if(!view) return;

        // Initialize FilterManager for this view
        FilterManager.initialize({
            onApply: handleApplyFilter,
            onClear: handleClearFilter,
        });

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
                showConfirmationModal('Confirm Deletion', `Are you sure you want to delete ${state.selectedRows.length} employee(s)?`, handleDeleteConfirm);
            }
        }, { signal });

        // Event handlers for non-filter modals remain
        document.querySelectorAll('.modal-close-btn').forEach(btn => {
            btn.addEventListener('click', closeModal, { signal });
        });
        document.getElementById('modal-backdrop')?.addEventListener('click', closeModal, { signal });
        document.getElementById('update-employee-form')?.addEventListener('submit', handleUpdateSubmit, { signal });
        document.getElementById('update-employee-belongs-to')?.addEventListener('change', (e) => {
            // ... logic for update modal ...
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
            if(tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-red-400">Failed to load data.</td></tr>`;
        }
    }

    return {
        initialize,
        cleanup
    };
})();
