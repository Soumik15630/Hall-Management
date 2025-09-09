// Archive View Module (Updated to use FilterManager)
window.ArchiveView = (function() {

    // --- STATE MANAGEMENT ---
    const defaultFilters = () => ({
        date: { from: '', to: '' },
        hall: { name: '', capacity: '', type: '' },
        belongsTo: { school: '', department: '' },
        features: [],
        incharge: { name: '' }
    });

    let state = {
        allHalls: [],
        filteredHalls: [],
        selectedRows: [],
        multiSelection: false,
        filters: defaultFilters(),
        // Caches for filter data to improve performance
        schoolsDataCache: null,
        departmentsDataCache: null,
        employeeDataCache: null,
    };

    let abortController;

    // --- API & DATA HANDLING ---
    async function fetchAllFormattedHalls(halls) {
        // This function now receives the halls to format, instead of fetching them.
        const [schools, departments] = await Promise.all([
            ApiService.organization.getSchools(),
            ApiService.organization.getDepartments()
        ]);

        const schoolMap = new Map(schools.map(s => [s.unique_id, s]));
        const departmentMap = new Map(departments.map(d => [d.unique_id, d]));

        return halls.map(hall => {
             let incharge = { name: 'N/A', role: 'N/A' };
             const dept = departmentMap.get(hall.department_id);
             const school = schoolMap.get(hall.school_id);

             if (dept) incharge = { name: dept.incharge_name, role: 'HOD' };
             else if (school) incharge = { name: school.incharge_name, role: 'Dean' };

            return {
                id: hall.unique_id,
                hallCode: hall.unique_id,
                hallName: hall.name,
                schoolName: school ? school.school_name : 'N/A',
                departmentName: dept ? dept.department_name : 'N/A',
                displayFeatures: Array.isArray(hall.features) ? hall.features.sort().map(f => f.replace(/_/g, ' ')).join(', ') : '',
                inchargeName: incharge.name,
                inchargeRole: incharge.role,
                displayStatus: hall.availability,
                displayDate: new Date(hall.created_at).toLocaleDateString(),
                ...hall
            };
        });
    }

    // --- FIXED: fetchArchivedHallData now uses the correct, filtered endpoint ---
    async function fetchArchivedHallData() {
        // Directly fetch only the archived halls from the server
        const archivedHalls = await ApiService.halls.getArchived();
        // Format the fetched halls for display
        return await fetchAllFormattedHalls(archivedHalls);
    }

    // --- FILTERING ---
    function applyFiltersAndRender() {
        const { date, hall, belongsTo, features, incharge } = state.filters;

        state.filteredHalls = state.allHalls.filter(h => {
            if (date.from && new Date(h.created_at) < new Date(date.from)) return false;
            if (date.to) {
                const toDate = new Date(date.to);
                toDate.setHours(23, 59, 59, 999);
                if (new Date(h.created_at) > toDate) return false;
            }
            if (hall.name && h.hallName !== hall.name) return false;
            if (hall.capacity && h.capacity < parseInt(hall.capacity, 10)) return false;
            if (hall.type && h.type !== hall.type) return false;
            if (belongsTo.school && h.schoolName !== belongsTo.school) return false;
            if (belongsTo.department && h.departmentName !== belongsTo.department) return false;
            if (incharge.name && h.inchargeName !== incharge.name) return false;
            if (features.length > 0 && !features.every(feature => h.features.includes(feature))) return false;

            return true;
        });

        renderArchivedHallTable();
    }


    // --- RENDERING ---
    function renderArchivedHallTable() {
        const tableBody = document.getElementById('archived-hall-details-body');
        if (!tableBody) return;

        if (!state.filteredHalls || state.filteredHalls.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No archived details match the current filters.</td></tr>`;
            return;
        }

        const tableHtml = state.filteredHalls.map(hall => {
            const isSelected = state.selectedRows.includes(hall.hallCode);
            return `
            <tr data-hall-code="${hall.hallCode}" class="${isSelected ? 'bg-blue-900/30' : ''} hover:bg-slate-800/50 transition-colors">
                <td class="py-4 pl-4 pr-3 text-sm sm:pl-6 align-top">
                    <input type="checkbox" class="row-checkbox rounded bg-slate-700 border-slate-500 text-blue-500 focus:ring-blue-500" ${isSelected ? 'checked' : ''}>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300 align-top">${hall.displayDate}</td>
                <td class="px-3 py-4 text-sm align-top">
                    <div class="font-medium text-blue-400">${hall.hallName}</div>
                    <div class="text-slate-400 text-xs break-all">${hall.hallCode}</div>
                </td>
                <td class="px-3 py-4 text-sm align-top">
                    <div class="font-medium text-blue-400">${hall.schoolName}</div>
                    <div class="text-slate-400">${hall.departmentName}</div>
                </td>
                <td class="px-3 py-4 text-sm text-slate-300 align-top">${hall.displayFeatures}</td>
                <td class="px-3 py-4 text-sm align-top">
                    <div class="font-medium text-blue-400">${hall.inchargeName}</div>
                    <div class="text-slate-400">${hall.inchargeRole}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm align-top">
                    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-900/50 text-red-400">Archived</span>
                </td>
            </tr>
        `
    }).join('');

        tableBody.innerHTML = tableHtml;
        updateActionButtonsState();
        updateFilterIcons();
        if (window.lucide) lucide.createIcons();
    }

    function updateFilterIcons() {
        document.querySelectorAll('#archive-view .filter-icon').forEach(icon => {
            const column = icon.dataset.filterColumn;
            let isActive = false;
            switch(column) {
                case 'date': isActive = state.filters.date.from || state.filters.date.to; break;
                case 'hall': isActive = state.filters.hall.name || state.filters.hall.capacity || state.filters.hall.type; break;
                case 'belongsTo': isActive = state.filters.belongsTo.school || state.filters.belongsTo.department; break;
                case 'features': isActive = state.filters.features.length > 0; break;
                case 'incharge': isActive = !!state.filters.incharge.name; break;
            }
            icon.classList.toggle('text-blue-400', isActive);
            icon.classList.toggle('text-slate-400', !isActive);
        });
    }


    // --- UI & STATE UPDATES ---
    function updateActionButtonsState() {
        const selectedCount = state.selectedRows.length;
        document.getElementById('reactivate-btn').disabled = selectedCount === 0;

        const selectAllCheckbox = document.getElementById('select-all-archive-checkbox');
        if (selectAllCheckbox) {
            selectAllCheckbox.disabled = !state.multiSelection;
            selectAllCheckbox.checked = state.multiSelection && selectedCount > 0 && selectedCount === state.filteredHalls.length;
        }
    }

    function handleRowSelection(hallCode, isChecked) {
        if (!state.multiSelection) {
            state.selectedRows = isChecked ? [hallCode] : [];
        } else {
            if (isChecked && !state.selectedRows.includes(hallCode)) {
                state.selectedRows.push(hallCode);
            } else if (!isChecked) {
                state.selectedRows = state.selectedRows.filter(code => code !== hallCode);
            }
        }
        renderArchivedHallTable();
    }

    // --- REFACTORED: Integration with FilterManager ---
    async function openFilterModalFor(column) {
        const context = {
            currentFilters: state.filters,
            allData: {
                halls: state.allHalls,
                employees: state.employeeDataCache,
                schools: state.schoolsDataCache,
                departments: state.departmentsDataCache
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


    // --- EVENT HANDLERS ---
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const view = document.getElementById('archive-view');
        if (!view) return;

        // Initialize the centralized filter manager for this view
        FilterManager.initialize({
            onApply: handleApplyFilter,
            onClear: handleClearFilter,
        });

        view.addEventListener('click', e => {
            const filterIcon = e.target.closest('.filter-icon');
            if (filterIcon) {
                openFilterModalFor(filterIcon.dataset.filterColumn);
            }
            if (e.target.closest('#clear-archive-filters-btn')) {
                state.filters = defaultFilters();
                applyFiltersAndRender();
            }
        }, { signal });

        document.getElementById('archive-multiselect-toggle')?.addEventListener('change', (e) => {
            state.multiSelection = e.target.checked;
            if (!state.multiSelection) state.selectedRows = [];
            renderArchivedHallTable();
        }, { signal });

        document.getElementById('select-all-archive-checkbox')?.addEventListener('change', (e) => {
            if (state.multiSelection) {
                state.selectedRows = e.target.checked ? state.filteredHalls.map(h => h.hallCode) : [];
                renderArchivedHallTable();
            }
        }, { signal });

        document.getElementById('archived-hall-details-body')?.addEventListener('change', (e) => {
            if (e.target.classList.contains('row-checkbox')) {
                const hallCode = e.target.closest('tr').dataset.hallCode;
                handleRowSelection(hallCode, e.target.checked);
            }
        }, { signal });

        document.getElementById('reactivate-btn')?.addEventListener('click', async () => {
            if (state.selectedRows.length === 0) return;
            
            showConfirmationModal(
                'Re-activate Halls?',
                `Are you sure you want to re-activate ${state.selectedRows.length} hall(s)?`, 
                async () => {
                    const reactivateBtn = document.getElementById('reactivate-btn');
                    if(reactivateBtn) reactivateBtn.disabled = true;

                    try {
                        const updatePromises = state.selectedRows.map(hallCode => 
                            ApiService.halls.update(hallCode, { availability: true })
                        );

                        await Promise.all(updatePromises);
                        showToast(`${state.selectedRows.length} hall(s) re-activated successfully.`, 'success');
                        
                        // --- FIX ---
                        // The filter now correctly uses hall.hallCode to find and remove the reactivated halls from the local state.
                        state.allHalls = state.allHalls.filter(hall => !state.selectedRows.includes(hall.hallCode));
                        state.selectedRows = [];
                        applyFiltersAndRender();

                    } catch (error) {
                        console.error("Failed to reactivate halls:", error);
                        showToast("An error occurred while reactivating halls.", 'error');
                        if(reactivateBtn) reactivateBtn.disabled = false;
                    }
                },
                { confirmText: 'Re-activate', confirmButtonClass: 'bg-green-600 hover:bg-green-700' }
            );
        }, { signal });
    }

    function cleanup() {
        if(abortController) abortController.abort();
        // Reset state to default
        Object.assign(state, {
            allHalls: [],
            filteredHalls: [],
            selectedRows: [],
            multiSelection: false,
            filters: defaultFilters()
        });
        const multiSelectToggle = document.getElementById('archive-multiselect-toggle');
        if(multiSelectToggle) multiSelectToggle.checked = false;
        FilterManager.close();
    }

    async function initialize() {
        try {
            // Pre-fetch and cache data required for filters to speed up modal opening
            if (!state.schoolsDataCache) {
                const [schools, departments, employees] = await Promise.all([
                    ApiService.organization.getSchools(),
                    ApiService.organization.getDepartments(),
                    ApiService.employees.getAll()
                ]);
                state.schoolsDataCache = schools;
                state.departmentsDataCache = departments;
                state.employeeDataCache = employees;
            }

            const data = await fetchArchivedHallData();
            state.allHalls = data;
            applyFiltersAndRender();
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading archived hall details:', error);
            const tableBody = document.getElementById('archived-hall-details-body');
            if(tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-400">Failed to load archived data. ${error.message}</td></tr>`;
        }
    }

    return {
        initialize,
        cleanup
    };
})();

