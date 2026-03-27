import React, { useEffect, useState } from "react";
import {
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  Home,
  Info,
  LayoutList,
  MessageSquare,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";

const STORAGE_KEY = "part1module:saved-modules:v1";
const VIEW_MODE_KEY = "part1module:view-mode:v1";

const genId = () => Math.random().toString(36).slice(2, 11);

const defaultMapping = () => ({
  productName: -1,
  productNumber: -1,
  description: -1,
  units: -1,
  msrp: -1,
  discount: -1,
});

const createEmptyCatalog = () => ({
  id: genId(),
  manufacturer: "",
  link: "",
  hasStandardDiscount: null,
  discountPercent: 10,
  hasLineItems: null,
  pastedData: "",
  headers: [],
  rows: [],
  mapping: defaultMapping(),
});

const createEmptyDirectImport = () => ({
  hasLineItems: null,
  hasStandardDiscount: null,
  discountPercent: 10,
  pastedData: "",
  headers: [],
  rows: [],
  mapping: defaultMapping(),
});

const readJsonStorage = (key, fallback) => {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJsonStorage = (key, value) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors in private mode or full storage conditions.
  }
};

const cloneData = (value) => JSON.parse(JSON.stringify(value));

const parseCurrency = (val) => {
  if (!val) return 0;
  const parsed = parseFloat(val.toString().replace(/[^0-9.-]+/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const YesNoToggle = ({ value, onChange }) => (
  <div className="flex space-x-3">
    <button
      onClick={() => onChange(true)}
      className={`px-6 py-2 border rounded-md font-medium transition-all ${
        value === true
          ? "bg-[#0e3f4e]/10 border-[#0e3f4e] text-[#0e3f4e] shadow-sm"
          : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
      }`}
    >
      Yes
    </button>
    <button
      onClick={() => onChange(false)}
      className={`px-6 py-2 border rounded-md font-medium transition-all ${
        value === false
          ? "bg-[#0e3f4e]/10 border-[#0e3f4e] text-[#0e3f4e] shadow-sm"
          : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
      }`}
    >
      No
    </button>
  </div>
);

const StepIndicator = ({ currentStep }) => {
  const steps = ["Welcome", "Vendor Info", "Catalogs & Imports", "Review & Edit"];

  return (
    <div className="max-w-4xl mx-auto mb-8 px-4">
      <div className="flex items-center justify-between">
        {steps.map((stepName, index) => (
          <React.Fragment key={stepName}>
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mb-2 transition-colors ${
                  currentStep > index
                    ? "bg-[#7eb03e] text-white"
                    : currentStep === index
                      ? "bg-[#0e3f4e] text-white ring-4 ring-[#0e3f4e]/20"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {currentStep > index ? <CheckCircle2 size={16} /> : index + 1}
              </div>
              <span
                className={`text-xs font-medium text-center ${
                  currentStep === index ? "text-[#0e3f4e]" : "text-gray-500"
                }`}
              >
                {stepName}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-1 mx-4 rounded-full transition-colors ${
                  currentStep > index ? "bg-[#7eb03e]" : "bg-gray-200"
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const styles = {
    Draft: "bg-gray-100 text-gray-700 border border-gray-200",
    Pending: "bg-yellow-50 text-yellow-800 border border-yellow-200",
    Approved: "bg-green-50 text-green-800 border border-green-200",
    Rejected: "bg-red-50 text-red-800 border border-red-200",
  };

  return (
    <span
      className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
        styles[status] || styles.Draft
      }`}
    >
      {status}
    </span>
  );
};

export default function App() {
  const [viewMode, setViewMode] = useState(() => readJsonStorage(VIEW_MODE_KEY, "vendor"));
  const [savedModules, setSavedModules] = useState(() => readJsonStorage(STORAGE_KEY, []));
  const [step, setStep] = useState(-1);
  const [editingId, setEditingId] = useState(null);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);

  const [vendorName, setVendorName] = useState("");
  const [contractName, setContractName] = useState("");
  const [type1, setType1] = useState("");
  const [usingThirdParty, setUsingThirdParty] = useState(null);
  const [catalogs, setCatalogs] = useState([createEmptyCatalog()]);
  const [directImport, setDirectImport] = useState(createEmptyDirectImport());
  const [tableData, setTableData] = useState([]);
  const [annotations, setAnnotations] = useState({ global: "", rows: {} });

  useEffect(() => {
    writeJsonStorage(STORAGE_KEY, savedModules);
  }, [savedModules]);

  useEffect(() => {
    writeJsonStorage(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  const resetWizard = () => {
    setEditingId(null);
    setConfirmingSubmit(false);
    setVendorName("");
    setContractName("");
    setType1("");
    setUsingThirdParty(null);
    setCatalogs([createEmptyCatalog()]);
    setDirectImport(createEmptyDirectImport());
    setTableData([]);
    setAnnotations({ global: "", rows: {} });
    setStep(0);
  };

  const saveModule = (newStatus = null) => {
    const existingModule = editingId ? savedModules.find((module) => module.id === editingId) : null;
    const status = newStatus || existingModule?.status || "Draft";

    const moduleData = {
      id: editingId || genId(),
      name: contractName || "Untitled Contract",
      vendor: vendorName || "Unknown Vendor",
      type: type1 || "Unspecified",
      date: existingModule?.date || new Date().toLocaleDateString(),
      itemCount: tableData.length,
      data: tableData,
      usingThirdParty,
      catalogs,
      directImport,
      status,
      annotations,
    };

    if (existingModule) {
      setSavedModules((prev) =>
        prev.map((module) => (module.id === editingId ? moduleData : module)),
      );
    } else {
      setSavedModules((prev) => [...prev, moduleData]);
    }

    setStep(-1);
  };

  const loadModule = (module, action = "edit") => {
    setEditingId(module.id);
    setContractName(module.name);
    setVendorName(module.vendor);
    setType1(module.type);
    setTableData(cloneData(module.data || []));

    if (module.usingThirdParty !== undefined) setUsingThirdParty(module.usingThirdParty);
    if (module.catalogs) setCatalogs(cloneData(module.catalogs));
    if (module.directImport) setDirectImport(cloneData(module.directImport));

    setAnnotations(cloneData(module.annotations || { global: "", rows: {} }));
    setConfirmingSubmit(action === "confirm");
    setStep(3);
  };

  const handleAddCatalog = () => {
    setCatalogs((prev) => [...prev, createEmptyCatalog()]);
  };

  const handleRemoveCatalog = (id) => {
    setCatalogs((prev) => prev.filter((catalog) => catalog.id !== id));
  };

  const updateCatalog = (id, field, value) => {
    setCatalogs((prev) =>
      prev.map((catalog) => (catalog.id === id ? { ...catalog, [field]: value } : catalog)),
    );
  };

  const autoMapHeaders = (headers) => ({
    productName: headers.findIndex(
      (header) =>
        header.toLowerCase().includes("name") || header.toLowerCase().includes("item"),
    ),
    productNumber: headers.findIndex(
      (header) =>
        header.toLowerCase().includes("#") ||
        header.toLowerCase().includes("num") ||
        header.toLowerCase().includes("sku"),
    ),
    description: headers.findIndex((header) => header.toLowerCase().includes("desc")),
    units: headers.findIndex(
      (header) =>
        header.toLowerCase().includes("unit") || header.toLowerCase().includes("uom"),
    ),
    msrp: headers.findIndex(
      (header) =>
        header.toLowerCase().includes("msrp") ||
        header.toLowerCase().includes("price") ||
        header.toLowerCase().includes("cost"),
    ),
    discount: headers.findIndex(
      (header) =>
        header.toLowerCase().includes("disc") || header.toLowerCase().includes("%"),
    ),
  });

  const handlePasteData = (catalogId, text) => {
    const lines = text.trim().split("\n");

    if (lines.length < 2) {
      updateCatalog(catalogId, "pastedData", text);
      return;
    }

    const headers = lines[0].split("\t").map((header) => header.trim());
    const rows = lines
      .slice(1)
      .map((line) => line.split("\t").map((cell) => cell.trim()))
      .filter((row) => row.some(Boolean));
    const mapping = autoMapHeaders(headers);

    setCatalogs((prev) =>
      prev.map((catalog) =>
        catalog.id === catalogId ? { ...catalog, pastedData: text, headers, rows, mapping } : catalog,
      ),
    );
  };

  const handleDirectPasteData = (text) => {
    const lines = text.trim().split("\n");

    if (lines.length < 2) {
      setDirectImport((prev) => ({ ...prev, pastedData: text }));
      return;
    }

    const headers = lines[0].split("\t").map((header) => header.trim());
    const rows = lines
      .slice(1)
      .map((line) => line.split("\t").map((cell) => cell.trim()))
      .filter((row) => row.some(Boolean));
    const mapping = autoMapHeaders(headers);

    setDirectImport((prev) => ({ ...prev, pastedData: text, headers, rows, mapping }));
  };

  const updateMapping = (catalogId, field, index) => {
    setCatalogs((prev) =>
      prev.map((catalog) =>
        catalog.id === catalogId
          ? { ...catalog, mapping: { ...catalog.mapping, [field]: index } }
          : catalog,
      ),
    );
  };

  const updateDirectMapping = (field, index) => {
    setDirectImport((prev) => ({
      ...prev,
      mapping: { ...prev.mapping, [field]: index },
    }));
  };

  const getCalculatedDiscount = (row, mapping, hasStandard, standardPct) => {
    if (mapping.discount !== -1 && row[mapping.discount]) {
      const mappedValue = parseFloat(
        row[mapping.discount].toString().replace(/[^0-9.-]+/g, ""),
      );

      if (!Number.isNaN(mappedValue)) return mappedValue;
    }

    return hasStandard ? standardPct : 0;
  };

  const generateTable = () => {
    const newTable = [];

    if (usingThirdParty) {
      catalogs.forEach((catalog) => {
        if (catalog.hasLineItems && catalog.rows.length > 0) {
          catalog.rows.forEach((row) => {
            const getValue = (index) => (index !== -1 && row[index] ? row[index] : "");

            newTable.push({
              id: genId(),
              manufacturer: catalog.manufacturer,
              website: catalog.link,
              productName: getValue(catalog.mapping.productName),
              productNumber: getValue(catalog.mapping.productNumber),
              description: getValue(catalog.mapping.description),
              units: getValue(catalog.mapping.units),
              msrp: getValue(catalog.mapping.msrp),
              discount: getCalculatedDiscount(
                row,
                catalog.mapping,
                catalog.hasStandardDiscount,
                catalog.discountPercent,
              ),
            });
          });
        } else if (catalog.manufacturer) {
          newTable.push({
            id: genId(),
            manufacturer: catalog.manufacturer,
            website: catalog.link,
            productName: `All ${catalog.manufacturer} Product Line`,
            productNumber: "",
            description: `see ${catalog.manufacturer} catalog located at ${catalog.link}`,
            units: "",
            msrp: `All ${catalog.manufacturer} products available from our company`,
            discount: catalog.hasStandardDiscount ? catalog.discountPercent : 0,
          });
        }
      });
    }

    if (directImport.hasLineItems && directImport.rows.length > 0) {
      directImport.rows.forEach((row) => {
        const getValue = (index) => (index !== -1 && row[index] ? row[index] : "");

        newTable.push({
          id: genId(),
          manufacturer: vendorName,
          website: "",
          productName: getValue(directImport.mapping.productName),
          productNumber: getValue(directImport.mapping.productNumber),
          description: getValue(directImport.mapping.description),
          units: getValue(directImport.mapping.units),
          msrp: getValue(directImport.mapping.msrp),
          discount: getCalculatedDiscount(
            row,
            directImport.mapping,
            directImport.hasStandardDiscount,
            directImport.discountPercent,
          ),
        });
      });
    }

    if (newTable.length === 0) {
      newTable.push({
        id: genId(),
        manufacturer: "",
        website: "",
        productName: "",
        productNumber: "",
        description: "",
        units: "",
        msrp: "",
        discount: 0,
      });
    }

    setTableData(newTable);
    setStep(3);
  };

  const HomeView = () => {
    const visibleModules = savedModules.filter((module) => {
      if (viewMode === "vendor") return true;
      if (viewMode === "coop") return module.status !== "Draft";
      return true;
    });

    return (
      <div className="animate-in fade-in duration-500">
        <div className="flex justify-center mb-10">
          <div className="bg-gray-200 p-1 rounded-xl inline-flex shadow-inner">
            <button
              onClick={() => {
                setViewMode("vendor");
                setStep(-1);
              }}
              className={`px-8 py-2.5 rounded-lg font-bold text-sm transition-all ${
                viewMode === "vendor"
                  ? "bg-white shadow border border-gray-100 text-[#0e3f4e]"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Vendor View
            </button>
            <button
              onClick={() => {
                setViewMode("coop");
                setStep(-1);
              }}
              className={`px-8 py-2.5 rounded-lg font-bold text-sm transition-all ${
                viewMode === "coop"
                  ? "bg-white shadow border border-gray-100 text-[#0e3f4e]"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Coop View
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 mb-8 lg:flex-row lg:justify-between lg:items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {viewMode === "vendor" ? "My Part 1 Contracts" : "Contracts for Review"}
            </h1>
            <p className="text-gray-500 mt-1">
              {viewMode === "vendor"
                ? "Manage and create your Part 1 Contracts."
                : "Review submitted vendor Part 1 Contracts."}
            </p>
          </div>
          {viewMode === "vendor" && (
            <button
              onClick={resetWizard}
              className="flex items-center justify-center px-6 py-3 bg-[#7eb03e] text-white font-bold rounded-lg shadow-md hover:bg-[#7eb03e]/90 transition-all hover:shadow-lg"
            >
              <Plus size={20} className="mr-2" /> Create New Contract
            </button>
          )}
        </div>

        {visibleModules.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-200 border-dashed">
            <LayoutList className="mx-auto text-gray-300 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-900">No contracts yet</h3>
            <p className="text-gray-500">
              {viewMode === "vendor"
                ? "Click the button above to create your first Part 1 contract."
                : "No submitted contracts to review yet."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-700 text-xs uppercase tracking-wider border-b border-gray-200">
                  <th className="p-4 font-semibold">Contract Name</th>
                  <th className="p-4 font-semibold">Vendor Name</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold">Items</th>
                  <th className="p-4 font-semibold">Date</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleModules.map((module) => (
                  <tr
                    key={module.id}
                    onDoubleClick={() => {
                      if (viewMode === "coop" && module.status === "Pending") loadModule(module, "review");
                      else if (viewMode === "vendor" && module.status === "Draft") loadModule(module, "edit");
                      else loadModule(module, "view");
                    }}
                    className="hover:bg-[#0e3f4e]/5 transition-colors group cursor-pointer"
                    title={
                      viewMode === "coop" && module.status === "Pending"
                        ? "Double-click to review"
                        : viewMode === "vendor" && module.status === "Draft"
                          ? "Double-click to edit"
                          : "Double-click to view"
                    }
                  >
                    <td className="p-4 font-bold text-gray-900">{module.name}</td>
                    <td className="p-4 font-medium text-gray-600">{module.vendor}</td>
                    <td className="p-4">
                      <StatusBadge status={module.status} />
                    </td>
                    <td className="p-4 text-gray-600">
                      <span className="bg-[#0e3f4e]/10 text-[#0e3f4e] px-2.5 py-0.5 rounded-full text-xs font-semibold">
                        {module.itemCount}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500 text-sm">{module.date}</td>
                    <td className="p-4 text-right flex items-center justify-end space-x-2">
                      {viewMode === "vendor" && module.status === "Draft" && (
                        <>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              loadModule(module, "confirm");
                            }}
                            className="p-2 text-gray-500 hover:text-[#7eb03e] transition-colors"
                            title="Submit to Coop"
                          >
                            <Send size={18} />
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setSavedModules((prev) => prev.filter((item) => item.id !== module.id));
                            }}
                            className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                            title="Delete Contract"
                          >
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                      {viewMode === "vendor" && module.status !== "Draft" && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            loadModule(module, "view");
                          }}
                          className="p-2 text-gray-500 hover:text-[#0e3f4e] transition-colors"
                          title="View Contract"
                        >
                          <Eye size={18} />
                        </button>
                      )}
                      {viewMode === "coop" && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            loadModule(module, module.status === "Pending" ? "review" : "view");
                          }}
                          className="p-2 text-gray-500 hover:text-[#0e3f4e] transition-colors"
                          title={module.status === "Pending" ? "Review Contract" : "View Contract"}
                        >
                          {module.status === "Pending" ? (
                            <MessageSquare size={18} />
                          ) : (
                            <Eye size={18} />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const WelcomeView = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-in fade-in zoom-in duration-500">
      <img
        src="https://images.squarespace-cdn.com/content/v1/67608cd79b306d0d155d1909/c8f86dd2-aa25-4eaf-9b5d-1706147c424e/econ-logo-smallE.png?format=1500w"
        alt="eConverge Logo"
        className="h-28 w-auto object-contain mb-6 drop-shadow-sm"
      />
      <h1 className="text-4xl font-bold text-gray-900 mb-4 tracking-tight">
        Welcome to the eConverge <span className="text-[#0e3f4e]">Part 1 Module</span>
      </h1>
      <p className="text-xl text-gray-500 mb-10 max-w-2xl">
        A smarter, guided way to submit your pricing and catalog information. Say goodbye to
        complex spreadsheets.
      </p>
      <button
        onClick={() => setStep(1)}
        className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-white bg-[#0e3f4e] rounded-full shadow-lg hover:bg-[#0e3f4e]/90 hover:shadow-xl transition-all hover:-translate-y-1 overflow-hidden"
      >
        <span className="relative z-10 flex items-center text-lg">
          Let&apos;s Get Started
          <ChevronRight className="ml-2 group-hover:translate-x-1 transition-transform" />
        </span>
      </button>
    </div>
  );

  const Step1View = () => (
    <div className="max-w-2xl mx-auto animate-in slide-in-from-right-8 fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="flex items-center mb-6 text-[#0e3f4e]">
          <Building2 className="mr-3" size={28} />
          <h2 className="text-2xl font-bold text-gray-900">Contract & Vendor Information</h2>
        </div>

        <div className="space-y-8">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              1. What is your company&apos;s name? (Vendor Name){" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={vendorName}
              onChange={(event) => setVendorName(event.target.value)}
              placeholder="Enter Vendor Name"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#0e3f4e] focus:border-[#0e3f4e] outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              2. Contract Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={contractName}
              onChange={(event) => setContractName(event.target.value)}
              placeholder="e.g., 2026 School District Pricing"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#0e3f4e] focus:border-[#0e3f4e] outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              3. Is this Type 1 for:
            </label>
            <div className="flex flex-wrap gap-4">
              {["Goods", "Services", "Both"].map((option) => (
                <button
                  key={option}
                  onClick={() => setType1(option)}
                  className={`flex-1 min-w-[120px] py-3 border rounded-xl font-medium transition-all ${
                    type1 === option
                      ? "bg-[#0e3f4e]/10 border-[#0e3f4e] text-[#0e3f4e] shadow-sm ring-1 ring-[#0e3f4e]"
                      : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-100 flex justify-end">
          <button
            onClick={() => setStep(2)}
            disabled={!vendorName.trim() || !contractName.trim() || !type1}
            className="flex items-center px-6 py-3 bg-[#0e3f4e] text-white font-semibold rounded-lg hover:bg-[#0e3f4e]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next Step <ChevronRight size={20} className="ml-1" />
          </button>
        </div>
      </div>
    </div>
  );

  const Step2View = () => {
    const MapColumnsUI = ({ mapping, onMapChange }) => (
      <div className="bg-white border border-[#0e3f4e]/20 rounded-xl p-5 shadow-sm mt-4">
        <h4 className="font-semibold text-[#0e3f4e] mb-4 flex items-center">
          <CheckCircle2 size={18} className="mr-2 text-[#7eb03e]" />
          Map Your Columns
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { key: "productName", label: "Product Name" },
            { key: "productNumber", label: "Product #" },
            { key: "description", label: "Description" },
            { key: "units", label: "Units description" },
            { key: "msrp", label: "MSRP / Pricing" },
            { key: "discount", label: "Discount %" },
          ].map((field) => (
            <div key={field.key} className="flex flex-col">
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                {field.label}
              </label>
              <select
                value={mapping.selections[field.key]}
                onChange={(event) => onMapChange(field.key, Number.parseInt(event.target.value, 10))}
                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-[#0e3f4e] focus:ring-[#0e3f4e] py-2"
              >
                <option value="-1">-- Ignore --</option>
                {mapping.headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header || `Column ${index + 1}`}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    );

    const canProceed = usingThirdParty !== null && directImport.hasLineItems !== null;

    return (
      <div className="max-w-5xl mx-auto animate-in slide-in-from-right-8 fade-in duration-300">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
          <div className="flex items-center mb-6 text-[#0e3f4e]">
            <LayoutList className="mr-3" size={28} />
            <h2 className="text-2xl font-bold text-gray-900">Catalog & Import Details</h2>
          </div>

          <div>
            <label className="block text-base font-semibold text-gray-800 mb-3">
              4. Are you using any 3rd party catalogs?
            </label>
            <YesNoToggle value={usingThirdParty} onChange={setUsingThirdParty} />
          </div>
        </div>

        {usingThirdParty === true && (
          <div className="space-y-6 mb-6">
            {catalogs.map((catalog, index) => (
              <div
                key={catalog.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden relative"
              >
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="font-bold text-gray-700 text-lg">Catalog {index + 1}</h3>
                  {catalogs.length > 1 && (
                    <button
                      onClick={() => handleRemoveCatalog(catalog.id)}
                      className="text-red-500 hover:text-red-700 p-2 rounded-md hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>

                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Manufacturer Name
                      </label>
                      <input
                        type="text"
                        value={catalog.manufacturer}
                        onChange={(event) =>
                          updateCatalog(catalog.id, "manufacturer", event.target.value)
                        }
                        placeholder="e.g., Acme Corp"
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#0e3f4e] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Link to Catalog
                      </label>
                      <input
                        type="url"
                        value={catalog.link}
                        onChange={(event) => updateCatalog(catalog.id, "link", event.target.value)}
                        placeholder="e.g., www.acme.com/catalog"
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#0e3f4e] outline-none"
                      />
                    </div>
                  </div>

                  <div className="bg-[#0e3f4e]/5 p-5 rounded-xl border border-[#0e3f4e]/20">
                    <label className="block text-sm font-semibold text-gray-800 mb-3">
                      Do you want to provide a standard discount on all items from this catalog?
                    </label>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                      <YesNoToggle
                        value={catalog.hasStandardDiscount}
                        onChange={(value) => updateCatalog(catalog.id, "hasStandardDiscount", value)}
                      />
                      {catalog.hasStandardDiscount && (
                        <div className="flex items-center animate-in fade-in zoom-in duration-200">
                          <span className="mr-2 text-sm font-medium text-gray-600">
                            Discount:
                          </span>
                          <div className="relative">
                            <input
                              type="number"
                              value={catalog.discountPercent}
                              onChange={(event) =>
                                updateCatalog(
                                  catalog.id,
                                  "discountPercent",
                                  Number.parseFloat(event.target.value) || 0,
                                )
                              }
                              className="w-24 pl-3 pr-8 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#0e3f4e] outline-none text-right"
                            />
                            <span className="absolute right-3 top-2.5 text-gray-500 font-medium">
                              %
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-6">
                    <label className="block text-sm font-semibold text-gray-800 mb-3">
                      Do you have line by line information for this catalog?
                    </label>
                    <YesNoToggle
                      value={catalog.hasLineItems}
                      onChange={(value) => updateCatalog(catalog.id, "hasLineItems", value)}
                    />

                    {catalog.hasLineItems === false && catalog.manufacturer && (
                      <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200 flex items-start text-sm text-amber-800">
                        <Info className="mr-2 shrink-0 mt-0.5" size={16} />
                        <p>
                          Since no line items are provided, a single general row will be created
                          referencing <strong>{catalog.manufacturer}&apos;s</strong> entire catalog
                          with your standard discount.
                        </p>
                      </div>
                    )}

                    {catalog.hasLineItems && (
                      <div className="mt-6 animate-in fade-in slide-in-from-top-4 duration-300">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Paste info from your spreadsheet below:
                        </label>
                        <textarea
                          rows={6}
                          value={catalog.pastedData}
                          onChange={(event) => handlePasteData(catalog.id, event.target.value)}
                          placeholder="Copy from Excel and paste here..."
                          className="w-full p-4 font-mono text-sm bg-gray-50 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#0e3f4e] focus:bg-white outline-none whitespace-pre overflow-x-auto shadow-inner mb-4"
                        />

                        {catalog.headers.length > 0 && (
                          MapColumnsUI({
                            mapping: { headers: catalog.headers, selections: catalog.mapping },
                            onMapChange: (field, index) => updateMapping(catalog.id, field, index),
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={handleAddCatalog}
              className="flex items-center justify-center w-full py-4 border-2 border-dashed border-gray-300 text-gray-600 rounded-xl hover:border-[#0e3f4e] hover:text-[#0e3f4e] hover:bg-[#0e3f4e]/5 transition-all font-medium"
            >
              <Plus size={20} className="mr-2" /> Add Another Catalog
            </button>
          </div>
        )}

        {usingThirdParty !== null && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 animate-in slide-in-from-top-4 duration-300">
            <label className="block text-base font-semibold text-gray-800 mb-3">
              5. Do you have any {usingThirdParty ? "additional " : ""}
              line items to import directly (not from a 3rd party catalog)?
            </label>
            <YesNoToggle
              value={directImport.hasLineItems}
              onChange={(value) => setDirectImport((prev) => ({ ...prev, hasLineItems: value }))}
            />

            {directImport.hasLineItems === false && !usingThirdParty && (
              <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200 flex items-start text-sm text-amber-800 animate-in fade-in">
                <Info className="mr-2 shrink-0 mt-0.5" size={16} />
                <p>
                  If you have no catalogs and no line items to import, your Part 1 Contract will be
                  created with a blank table for you to manually add rows.
                </p>
              </div>
            )}

            {directImport.hasLineItems === true && (
              <div className="mt-8 pt-8 border-t border-gray-100 animate-in fade-in">
                <div className="bg-[#0e3f4e]/5 p-5 rounded-xl border border-[#0e3f4e]/20 mb-8">
                  <label className="block text-sm font-semibold text-gray-800 mb-3">
                    Do you want to provide a standard discount on all items you are importing?
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                    <YesNoToggle
                      value={directImport.hasStandardDiscount}
                      onChange={(value) =>
                        setDirectImport((prev) => ({ ...prev, hasStandardDiscount: value }))
                      }
                    />
                    {directImport.hasStandardDiscount && (
                      <div className="flex items-center animate-in fade-in zoom-in duration-200">
                        <span className="mr-2 text-sm font-medium text-gray-600">
                          Discount:
                        </span>
                        <div className="relative">
                          <input
                            type="number"
                            value={directImport.discountPercent}
                            onChange={(event) =>
                              setDirectImport((prev) => ({
                                ...prev,
                                discountPercent: Number.parseFloat(event.target.value) || 0,
                              }))
                            }
                            className="w-24 pl-3 pr-8 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#0e3f4e] outline-none text-right"
                          />
                          <span className="absolute right-3 top-2.5 text-gray-500 font-medium">
                            %
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Paste line by line info from your spreadsheet below:
                </label>
                <textarea
                  rows={8}
                  value={directImport.pastedData}
                  onChange={(event) => handleDirectPasteData(event.target.value)}
                  placeholder="Copy from Excel and paste here..."
                  className="w-full p-4 font-mono text-sm bg-gray-50 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#0e3f4e] focus:bg-white outline-none whitespace-pre overflow-x-auto shadow-inner mb-4"
                />

                {directImport.headers.length > 0 && (
                  MapColumnsUI({
                    mapping: {
                      headers: directImport.headers,
                      selections: directImport.mapping,
                    },
                    onMapChange: updateDirectMapping,
                  })
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex justify-between items-center">
          <button
            onClick={() => setStep(1)}
            className="flex items-center px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} className="mr-1" /> Back
          </button>
          <button
            onClick={generateTable}
            disabled={!canProceed}
            className="flex items-center px-8 py-3 bg-[#0e3f4e] text-white font-bold rounded-lg shadow-md hover:bg-[#0e3f4e]/90 disabled:opacity-50 transition-all hover:shadow-lg"
          >
            <FileSpreadsheet size={20} className="mr-2" /> Create Part 1 Table
          </button>
        </div>
      </div>
    );
  };

  const TableView = () => {
    const currentModule = savedModules.find((module) => module.id === editingId);
    const currentStatus = currentModule ? currentModule.status : "Draft";

    const isEditMode = viewMode === "vendor" && currentStatus === "Draft" && !confirmingSubmit;
    const isConfirmMode = viewMode === "vendor" && confirmingSubmit;
    const isReviewMode = viewMode === "coop" && currentStatus === "Pending";
    const isViewMode = !isEditMode && !isConfirmMode && !isReviewMode;
    const readOnly = !isEditMode && !isConfirmMode;

    const handleCellChange = (id, field, value) => {
      setTableData((prev) =>
        prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
      );
    };

    const calculateDiscountedPrice = (msrp, discountPercent) => {
      if (!msrp) return "";

      const msrpString = msrp.toString();

      if (msrpString.toLowerCase().includes("all") || msrpString.toLowerCase().includes("see ")) {
        return "N/A";
      }

      const msrpValue = parseCurrency(msrpString);
      const discountValue = parseCurrency(discountPercent?.toString() || "0");

      if (msrpValue === 0 && msrpString.trim() !== "0" && msrpString.trim() !== "$0") return "N/A";

      const finalPrice = msrpValue * (1 - discountValue / 100);

      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(finalPrice);
    };

    const handleAddRow = () => {
      setTableData((prev) => [
        ...prev,
        {
          id: genId(),
          manufacturer: "",
          website: "",
          productName: "",
          productNumber: "",
          description: "",
          units: "",
          msrp: "",
          discount: 0,
        },
      ]);
    };

    return (
      <div className="w-full animate-in slide-in-from-bottom-8 fade-in duration-500">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center">
                {isConfirmMode ? "Confirm Submission: " : isReviewMode ? "Review Contract: " : ""}
                {contractName || "Generated Part 1 Data"}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {isConfirmMode
                  ? "Please review your contract before submitting it to the Coop."
                  : isReviewMode
                    ? "Add annotations and approve or reject this submission."
                    : isViewMode
                      ? "Viewing contract details."
                      : "Review and inline-edit your final submission table."}
              </p>
            </div>
            <div className="flex space-x-3 items-center">
              <StatusBadge status={currentStatus} />
              {(isEditMode || isConfirmMode) && (
                <button
                  onClick={handleAddRow}
                  className="flex items-center px-4 py-2 text-sm font-semibold text-[#0e3f4e] border border-[#0e3f4e]/20 bg-white rounded-lg hover:bg-[#0e3f4e]/5 transition-colors shadow-sm"
                >
                  <Plus size={16} className="mr-2" /> Add Custom Row
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 text-gray-700 text-xs uppercase tracking-wider border-b border-gray-200">
                  <th className="w-[9%] p-2.5 font-semibold border-r border-gray-200">
                    Manufacturer
                  </th>
                  <th className="w-[10%] p-2.5 font-semibold border-r border-gray-200">
                    Website
                  </th>
                  <th className="w-[12%] p-2.5 font-semibold border-r border-gray-200">
                    Product Name
                  </th>
                  <th className="w-[8%] p-2.5 font-semibold border-r border-gray-200">
                    Product #
                  </th>
                  <th className="w-[15%] p-2.5 font-semibold border-r border-gray-200">
                    Description
                  </th>
                  <th className="w-[9%] p-2.5 font-semibold border-r border-gray-200">
                    Units description
                  </th>
                  <th className="w-[9%] p-2.5 font-semibold border-r border-gray-200">
                    MSRP/Pricing
                  </th>
                  <th className="w-[7%] p-2.5 font-semibold border-r border-gray-200">
                    % Discount
                  </th>
                  <th className="w-[9%] p-2.5 font-bold text-[#0e3f4e] bg-[#0e3f4e]/5 border-r border-gray-200">
                    Discounted Price
                  </th>
                  {(isReviewMode || isViewMode) && (
                    <th className="w-[12%] p-2.5 font-bold bg-amber-50 text-amber-900 border-r border-gray-200">
                      Coop Notes / Annotations
                    </th>
                  )}
                  {!readOnly && <th className="p-3 w-10"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tableData.map((row) => (
                  <tr key={row.id} className="hover:bg-[#0e3f4e]/5 transition-colors group">
                    <td className="p-0 border-r border-gray-200 align-top">
                      <input
                        className={`w-full min-w-0 h-full min-h-[44px] px-2.5 py-2 bg-transparent outline-none focus:ring-2 focus:ring-inset focus:ring-[#0e3f4e] text-xs leading-5 ${
                          readOnly ? "text-gray-600 cursor-default" : ""
                        }`}
                        value={row.manufacturer}
                        onChange={(event) =>
                          handleCellChange(row.id, "manufacturer", event.target.value)
                        }
                        disabled={readOnly}
                      />
                    </td>
                    <td className="p-0 border-r border-gray-200 align-top">
                      <input
                        className={`w-full min-w-0 h-full min-h-[44px] px-2.5 py-2 bg-transparent outline-none focus:ring-2 focus:ring-inset focus:ring-[#0e3f4e] text-xs leading-5 ${
                          readOnly ? "text-gray-600 cursor-default" : ""
                        }`}
                        value={row.website}
                        onChange={(event) => handleCellChange(row.id, "website", event.target.value)}
                        disabled={readOnly}
                      />
                    </td>
                    <td className="p-0 border-r border-gray-200 align-top">
                      <input
                        className={`w-full min-w-0 h-full min-h-[44px] px-2.5 py-2 bg-transparent outline-none focus:ring-2 focus:ring-inset focus:ring-[#0e3f4e] text-xs leading-5 font-medium ${
                          readOnly ? "text-gray-600 cursor-default" : ""
                        }`}
                        value={row.productName}
                        onChange={(event) =>
                          handleCellChange(row.id, "productName", event.target.value)
                        }
                        disabled={readOnly}
                      />
                    </td>
                    <td className="p-0 border-r border-gray-200 align-top">
                      <input
                        className={`w-full min-w-0 h-full min-h-[44px] px-2.5 py-2 bg-transparent outline-none focus:ring-2 focus:ring-inset focus:ring-[#0e3f4e] text-xs leading-5 ${
                          readOnly ? "text-gray-600 cursor-default" : ""
                        }`}
                        value={row.productNumber}
                        onChange={(event) =>
                          handleCellChange(row.id, "productNumber", event.target.value)
                        }
                        disabled={readOnly}
                      />
                    </td>
                    <td className="p-0 border-r border-gray-200 align-top">
                      <input
                        className={`w-full min-w-0 h-full min-h-[44px] px-2.5 py-2 bg-transparent outline-none focus:ring-2 focus:ring-inset focus:ring-[#0e3f4e] text-xs leading-5 ${
                          readOnly ? "text-gray-600 cursor-default" : ""
                        }`}
                        value={row.description}
                        onChange={(event) =>
                          handleCellChange(row.id, "description", event.target.value)
                        }
                        disabled={readOnly}
                      />
                    </td>
                    <td className="p-0 border-r border-gray-200 align-top">
                      <input
                        className={`w-full min-w-0 h-full min-h-[44px] px-2.5 py-2 bg-transparent outline-none focus:ring-2 focus:ring-inset focus:ring-[#0e3f4e] text-xs leading-5 ${
                          readOnly ? "text-gray-600 cursor-default" : ""
                        }`}
                        value={row.units}
                        onChange={(event) => handleCellChange(row.id, "units", event.target.value)}
                        disabled={readOnly}
                      />
                    </td>
                    <td className="p-0 border-r border-gray-200 align-top">
                      <input
                        className={`w-full min-w-0 h-full min-h-[44px] px-2.5 py-2 bg-transparent outline-none focus:ring-2 focus:ring-inset focus:ring-[#0e3f4e] text-xs leading-5 ${
                          readOnly ? "text-gray-600 cursor-default" : ""
                        }`}
                        value={row.msrp}
                        onChange={(event) => handleCellChange(row.id, "msrp", event.target.value)}
                        disabled={readOnly}
                      />
                    </td>
                    <td className="p-0 border-r border-gray-200 align-top">
                      <div className="relative h-full">
                        <input
                          className={`w-full min-w-0 h-full min-h-[44px] pl-2.5 pr-6 py-2 bg-transparent outline-none focus:ring-2 focus:ring-inset focus:ring-[#0e3f4e] text-xs leading-5 text-right ${
                            readOnly ? "text-gray-600 cursor-default" : ""
                          }`}
                          type="number"
                          value={row.discount}
                          onChange={(event) =>
                            handleCellChange(row.id, "discount", event.target.value)
                          }
                          disabled={readOnly}
                        />
                        <span className="absolute right-2 top-3 text-gray-400 text-xs">%</span>
                      </div>
                    </td>
                    <td className="p-2.5 bg-[#0e3f4e]/5 font-semibold text-[#0e3f4e] text-right text-xs leading-5 whitespace-normal break-words border-r border-gray-200 align-top">
                      {calculateDiscountedPrice(row.msrp, row.discount)}
                    </td>

                    {(isReviewMode || isViewMode) && (
                      <td
                        className={`p-0 border-r border-gray-200 align-top ${
                          isReviewMode ? "bg-amber-50/50" : "bg-transparent"
                        }`}
                      >
                        <input
                          className={`w-full min-w-0 h-full min-h-[44px] px-2.5 py-2 bg-transparent outline-none focus:ring-2 focus:ring-inset focus:ring-amber-500 text-xs leading-5 placeholder:text-amber-300 ${
                            !isReviewMode
                              ? "text-amber-800 italic cursor-default"
                              : "text-amber-900 font-medium"
                          }`}
                          value={annotations.rows[row.id] || ""}
                          onChange={(event) =>
                            setAnnotations((prev) => ({
                              ...prev,
                              rows: { ...prev.rows, [row.id]: event.target.value },
                            }))
                          }
                          disabled={!isReviewMode}
                          placeholder={isReviewMode ? "Add note here..." : ""}
                        />
                      </td>
                    )}

                    {!readOnly && (
                      <td className="p-0 text-center">
                        <button
                          onClick={() => setTableData((prev) => prev.filter((item) => item.id !== row.id))}
                          className="p-2 text-gray-400 hover:text-red-600 transition-opacity"
                          title="Delete Row"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(isReviewMode || (isViewMode && annotations.global)) && (
            <div className="p-6 bg-amber-50 border-t border-amber-200">
              <div className="flex items-start">
                <MessageSquare className="text-amber-600 mr-3 mt-1 shrink-0" size={20} />
                <div className="flex-1">
                  <label className="block font-bold text-amber-900 mb-2">
                    {isReviewMode
                      ? "Overall Coop Comments / Annotations:"
                      : "Coop Comments:"}
                  </label>
                  {isReviewMode ? (
                    <textarea
                      className="w-full p-4 rounded-lg border border-amber-300 focus:ring-2 focus:ring-amber-500 outline-none text-amber-900 bg-white shadow-sm"
                      rows={3}
                      value={annotations.global}
                      onChange={(event) =>
                        setAnnotations((prev) => ({ ...prev, global: event.target.value }))
                      }
                      placeholder="Type overall feedback here..."
                    />
                  ) : (
                    <div className="p-4 bg-white/60 rounded-lg border border-amber-200 text-amber-900 whitespace-pre-wrap">
                      {annotations.global}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
            {isEditMode && (
              <>
                <button
                  onClick={() => setStep(2)}
                  className="text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
                >
                  Go Back to Settings
                </button>
                <button
                  onClick={() => saveModule("Draft")}
                  className="flex items-center px-8 py-3 bg-[#0e3f4e] text-white font-bold rounded-lg shadow-md hover:bg-[#0e3f4e]/90 transition-all hover:-translate-y-0.5"
                >
                  <Save size={20} className="mr-2" /> Save Draft
                </button>
              </>
            )}

            {isConfirmMode && (
              <>
                <button
                  onClick={() => setStep(-1)}
                  className="text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveModule("Pending")}
                  className="flex items-center px-8 py-3 bg-[#7eb03e] text-white font-bold rounded-lg shadow-md hover:bg-[#7eb03e]/90 transition-all hover:-translate-y-0.5"
                >
                  <Send size={20} className="mr-2" /> Submit to Coop
                </button>
              </>
            )}

            {isReviewMode && (
              <>
                <button
                  onClick={() => setStep(-1)}
                  className="text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
                >
                  Cancel Review
                </button>
                <div className="flex space-x-4">
                  <button
                    onClick={() => saveModule("Rejected")}
                    className="flex items-center px-8 py-3 bg-red-600 text-white font-bold rounded-lg shadow-md hover:bg-red-700 transition-all hover:-translate-y-0.5"
                  >
                    <X size={20} className="mr-2" /> Reject
                  </button>
                  <button
                    onClick={() => saveModule("Approved")}
                    className="flex items-center px-8 py-3 bg-[#7eb03e] text-white font-bold rounded-lg shadow-md hover:bg-[#7eb03e]/90 transition-all hover:-translate-y-0.5"
                  >
                    <Check size={20} className="mr-2" /> Approve
                  </button>
                </div>
              </>
            )}

            {isViewMode && (
              <>
                <div></div>
                <button
                  onClick={() => setStep(-1)}
                  className="flex items-center px-8 py-3 bg-gray-200 text-gray-800 font-bold rounded-lg shadow-sm hover:bg-gray-300 transition-colors"
                >
                  Back to Dashboard
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const currentModuleForSteps = editingId
    ? savedModules.find((module) => module.id === editingId)
    : null;
  const currentStatusForSteps = currentModuleForSteps ? currentModuleForSteps.status : "Draft";
  const hideSteps =
    step === 3 &&
    (confirmingSubmit || viewMode === "coop" || currentStatusForSteps !== "Draft");

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 font-sans selection:bg-[#0e3f4e]/20">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-[1680px] mx-auto px-4 xl:px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => setStep(-1)}
            className="flex items-center hover:opacity-80 transition-opacity"
            title="Return to Dashboard"
          >
            <img
              src="https://images.squarespace-cdn.com/content/v1/67608cd79b306d0d155d1909/c8f86dd2-aa25-4eaf-9b5d-1706147c424e/econ-logo-smallE.png?format=1500w"
              alt="eConverge Logo"
              className="h-8 w-auto object-contain"
            />
          </button>

          <div className="flex items-center space-x-4">
            {step >= 0 && contractName && (
              <span className="text-sm font-bold text-[#0e3f4e] bg-[#0e3f4e]/10 px-3 py-1 rounded-full hidden sm:block">
                {contractName}
              </span>
            )}
            {step >= 0 && vendorName && (
              <span className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full hidden sm:block">
                {vendorName}
              </span>
            )}
            {step >= 0 && (
              <button
                onClick={() => setStep(-1)}
                className="flex items-center text-sm font-semibold text-gray-600 hover:text-[#0e3f4e] transition-colors"
              >
                <Home size={16} className="mr-1" /> Dashboard
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1680px] mx-auto px-4 xl:px-6 py-8">
        {step >= 0 && !hideSteps && <StepIndicator currentStep={step - 1} />}

        {step === -1 && HomeView()}
        {step === 0 && WelcomeView()}
        {step === 1 && Step1View()}
        {step === 2 && Step2View()}
        {step === 3 && TableView()}
      </main>
    </div>
  );
}
