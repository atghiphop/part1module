import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
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
import EstimatorPage, {
  ESTIMATOR_BOOKS_STORAGE_KEY,
  getEstimatorImportFixedSourceId,
  ESTIMATOR_IMPORT_IGNORE_SOURCE_ID,
  buildPart1RowsFromEstimatorBook,
  getEstimatorBookImportConfig,
  getBookItemCount,
  normalizeStoredBooks,
  summarizeEstimatorBookForPart1Import,
} from "./EstimatorPage";

const STORAGE_KEY = "part1module:saved-modules:v1";
const VIEW_MODE_KEY = "part1module:view-mode:v1";
const ESTIMATOR_HASH = "#/estimator";
const CONTRACT_IMPORT_TEMPLATES_STORAGE_KEY = "part1module:contract-import-templates:v1";

const genId = () => Math.random().toString(36).slice(2, 11);

const getCurrentPage = () => {
  if (typeof window === "undefined") return "contracts";
  return window.location.hash === ESTIMATOR_HASH ? "estimator" : "contracts";
};

const defaultMapping = () => ({
  productName: -1,
  productNumber: -1,
  description: -1,
  units: -1,
  msrp: -1,
  discount: -1,
});

const ESTIMATOR_MAPPING_FIELDS = [
  { key: "productName", label: "Product Name" },
  { key: "productNumber", label: "Product #" },
  { key: "description", label: "Description" },
  { key: "units", label: "Units description" },
  { key: "msrp", label: "MSRP / Pricing" },
  { key: "discount", label: "Discount %" },
];
const ESTIMATOR_BOOK_OPTIONAL_FIELDS = [
  { key: "manufacturer", label: "Manufacturer", allowFixed: true },
  { key: "website", label: "Website", allowFixed: true },
];
const ESTIMATOR_BOOK_IMPORT_MAPPING_FIELDS = [
  ...ESTIMATOR_BOOK_OPTIONAL_FIELDS,
  ...ESTIMATOR_MAPPING_FIELDS,
];
const CONTRACT_IMPORT_FIELD_KEYS = ESTIMATOR_MAPPING_FIELDS.map((field) => field.key);
const CONTRACT_IMPORT_PREVIEW_ROW_LIMIT = 5;

const normalizeContractImportMappingTypes = (value) => {
  const rawTypes = Array.isArray(value)
    ? value
    : Array.isArray(value?.types)
      ? value.types
      : typeof value === "string"
        ? [value]
        : typeof value?.type === "string"
          ? [value.type]
          : [];

  return Array.from(new Set(rawTypes.filter((type) => CONTRACT_IMPORT_FIELD_KEYS.includes(type)))).sort(
    (left, right) => CONTRACT_IMPORT_FIELD_KEYS.indexOf(left) - CONTRACT_IMPORT_FIELD_KEYS.indexOf(right),
  );
};

const createContractImportColumnMappingState = (value = []) => {
  const types = normalizeContractImportMappingTypes(value);

  return {
    type: types[0] ?? "ignore",
    types,
  };
};

const createEmptyContractImportColumnMapping = () => ({
  ...createContractImportColumnMappingState(),
  isFixed: false,
  fixedValue: "",
  customName: "",
});

const contractImportMappingHasType = (mapping, type) =>
  normalizeContractImportMappingTypes(mapping).includes(type);

const contractImportMappingIsIgnored = (mapping) =>
  normalizeContractImportMappingTypes(mapping).length === 0;

const normalizeContractImportColumnMapping = (mapping) => ({
  ...createEmptyContractImportColumnMapping(),
  ...createContractImportColumnMappingState(mapping),
  isFixed: mapping?.isFixed === true,
  fixedValue: typeof mapping?.fixedValue === "string" ? mapping.fixedValue : "",
  customName: typeof mapping?.customName === "string" ? mapping.customName : "",
});

const parseSpreadsheetText = (text) => {
  if (!text || !text.trim()) {
    return [];
  }

  let delimiter = "\t";
  if (!text.includes("\t") && text.includes(",")) {
    delimiter = ",";
  }

  return text
    .split("\n")
    .filter((row) => row.trim() !== "")
    .map((row) => row.split(delimiter).map((cell) => cell.trim()));
};

const getParsedColumnCount = (rows) =>
  Array.isArray(rows) && rows.length > 0 ? rows.reduce((max, row) => Math.max(max, row.length), 0) : 0;

const getCombinedHeaderFromRows = (rows, headerRowCount, colIndex) => {
  if (headerRowCount === 0) {
    return `Column ${colIndex + 1}`;
  }

  const headerText = [];
  for (let index = 0; index < headerRowCount; index += 1) {
    if (rows[index] && rows[index][colIndex]) {
      headerText.push(rows[index][colIndex].trim());
    }
  }

  return headerText.join(" ").trim() || `Column ${colIndex + 1}`;
};

const autoMapHeaders = (headers) => ({
  productName: headers.findIndex(
    (header) => header.toLowerCase().includes("name") || header.toLowerCase().includes("item"),
  ),
  productNumber: headers.findIndex(
    (header) =>
      header.toLowerCase().includes("#") ||
      header.toLowerCase().includes("num") ||
      header.toLowerCase().includes("sku"),
  ),
  description: headers.findIndex((header) => header.toLowerCase().includes("desc")),
  units: headers.findIndex(
    (header) => header.toLowerCase().includes("unit") || header.toLowerCase().includes("uom"),
  ),
  msrp: headers.findIndex(
    (header) =>
      header.toLowerCase().includes("msrp") ||
      header.toLowerCase().includes("price") ||
      header.toLowerCase().includes("cost"),
  ),
  discount: headers.findIndex(
    (header) => header.toLowerCase().includes("disc") || header.toLowerCase().includes("%"),
  ),
});

const buildColumnMappingsFromFieldSelections = (fieldSelections, columnCount) => {
  const nextMappings = Array.from({ length: columnCount }, () => createEmptyContractImportColumnMapping());

  ESTIMATOR_MAPPING_FIELDS.forEach(({ key }) => {
    const sourceIndex = fieldSelections?.[key];
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= columnCount) {
      return;
    }

    const currentMapping = nextMappings[sourceIndex];
    nextMappings[sourceIndex] = {
      ...currentMapping,
      ...createContractImportColumnMappingState([
        ...normalizeContractImportMappingTypes(currentMapping),
        key,
      ]),
    };
  });

  return nextMappings;
};

const createAutoMappedContractImportColumnMappings = (rows, headerRowCount = 1) => {
  const columnCount = getParsedColumnCount(rows);
  const headers = Array.from({ length: columnCount }, (_, index) =>
    getCombinedHeaderFromRows(rows, headerRowCount, index),
  );

  return buildColumnMappingsFromFieldSelections(autoMapHeaders(headers), columnCount);
};

const deriveLegacyFieldSelectionsFromColumnMappings = (columnMappings, parsedColumnCount) => {
  const nextSelections = defaultMapping();

  ESTIMATOR_MAPPING_FIELDS.forEach(({ key }) => {
    const selectedIndex = columnMappings.findIndex(
      (mapping, index) =>
        index < parsedColumnCount && mapping?.isFixed !== true && contractImportMappingHasType(mapping, key),
    );

    nextSelections[key] = selectedIndex >= 0 ? selectedIndex : -1;
  });

  return nextSelections;
};

const normalizeContractImportSource = (source = {}) => {
  const parsedFromPastedData =
    typeof source?.pastedData === "string" ? parseSpreadsheetText(source.pastedData) : [];
  const parsedFromLegacyRows =
    Array.isArray(source?.headers) || Array.isArray(source?.rows)
      ? [
          Array.isArray(source?.headers) ? source.headers : [],
          ...(Array.isArray(source?.rows) ? source.rows : []),
        ]
      : [];
  const parsedData =
    Array.isArray(source?.parsedData) && source.parsedData.length > 0
      ? source.parsedData.map((row) =>
          Array.isArray(row) ? row.map((cell) => (cell == null ? "" : String(cell))) : [],
        )
      : parsedFromPastedData.length > 0
        ? parsedFromPastedData
        : parsedFromLegacyRows;
  const parsedColumnCount = getParsedColumnCount(parsedData);
  const maxHeaderRowCount = Math.max(0, parsedData.length - 1);
  const requestedHeaderRows =
    typeof source?.headerRowCount === "number"
      ? source.headerRowCount
      : parsedData.length > 0
        ? 1
        : 0;
  const headerRowCount = Math.min(Math.max(requestedHeaderRows, 0), maxHeaderRowCount);
  const hasStoredColumnMappings =
    Array.isArray(source?.columnMappings) && source.columnMappings.length > 0;
  const baseColumnMappings = hasStoredColumnMappings
    ? source.columnMappings.map(normalizeContractImportColumnMapping)
    : parsedColumnCount > 0
      ? buildColumnMappingsFromFieldSelections(
          Object.values(source?.mapping || {}).some((value) => Number.isInteger(value) && value >= 0)
            ? source.mapping
            : autoMapHeaders(
                Array.from({ length: parsedColumnCount }, (_, index) =>
                  getCombinedHeaderFromRows(parsedData, headerRowCount, index),
                ),
              ),
          parsedColumnCount,
        )
      : [];
  const columnMappings =
    baseColumnMappings.length >= parsedColumnCount
      ? baseColumnMappings
      : [
          ...baseColumnMappings,
          ...Array.from(
            { length: parsedColumnCount - baseColumnMappings.length },
            () => createEmptyContractImportColumnMapping(),
          ),
        ];
  const headers = Array.from({ length: parsedColumnCount }, (_, index) =>
    getCombinedHeaderFromRows(parsedData, headerRowCount, index),
  );
  const rows = parsedData
    .slice(headerRowCount)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));

  return {
    ...source,
    pastedData:
      typeof source?.pastedData === "string"
        ? source.pastedData
        : parsedData.map((row) => row.join("\t")).join("\n"),
    parsedData,
    headerRowCount,
    columnMappings,
    selectedTemplateId: typeof source?.selectedTemplateId === "string" ? source.selectedTemplateId : "",
    headers,
    rows,
    mapping: deriveLegacyFieldSelectionsFromColumnMappings(columnMappings, parsedColumnCount),
  };
};

const normalizeStoredContractImportTemplates = (storedTemplates) => {
  if (!Array.isArray(storedTemplates)) {
    return [];
  }

  return storedTemplates.filter(
    (template) =>
      template &&
      typeof template.id === "string" &&
      typeof template.name === "string" &&
      Array.isArray(template.mappings),
  );
};

const parseImportedDiscountValue = (value) => {
  if (value == null || String(value).trim() === "") {
    return null;
  }

  const parsedValue = parseFloat(String(value).replace(/[^0-9.-]+/g, ""));
  return Number.isNaN(parsedValue) ? null : parsedValue;
};

const buildContractRowsFromImportSource = (source, options = {}) => {
  const normalizedSource = normalizeContractImportSource(source);
  const hasMappedColumns = normalizedSource.columnMappings.some(
    (mapping) => !contractImportMappingIsIgnored(mapping),
  );

  if (!hasMappedColumns) {
    return [];
  }

  return normalizedSource.rows
    .map((row) => {
      const nextRow = {
        id: genId(),
        manufacturer: options.manufacturer || "",
        website: options.website || "",
        productName: "",
        productNumber: "",
        description: "",
        units: "",
        msrp: "",
        discount: options.hasStandardDiscount ? options.discountPercent : 0,
      };
      let hasMappedValue = false;
      let mappedDiscountValue = null;

      normalizedSource.columnMappings.forEach((mapping, columnIndex) => {
        const mappedTypes = normalizeContractImportMappingTypes(mapping);
        if (mappedTypes.length === 0) {
          return;
        }

        const rawValue = mapping.isFixed ? mapping.fixedValue : row[columnIndex];
        const value = rawValue ? String(rawValue).trim() : "";

        mappedTypes.forEach((fieldKey) => {
          if (fieldKey === "discount") {
            const parsedDiscountValue = parseImportedDiscountValue(value);
            if (parsedDiscountValue !== null) {
              mappedDiscountValue = parsedDiscountValue;
              hasMappedValue = true;
            }
            return;
          }

          if (value) {
            nextRow[fieldKey] = value;
            hasMappedValue = true;
          }
        });
      });

      nextRow.discount =
        mappedDiscountValue !== null
          ? mappedDiscountValue
          : options.hasStandardDiscount
            ? options.discountPercent
            : 0;

      return hasMappedValue ? nextRow : null;
    })
    .filter(Boolean);
};

const createEmptyCatalog = () => ({
  id: genId(),
  manufacturer: "",
  link: "",
  hasStandardDiscount: null,
  discountPercent: 10,
  hasLineItems: null,
  pastedData: "",
  parsedData: [],
  headerRowCount: 1,
  columnMappings: [],
  selectedTemplateId: "",
  headers: [],
  rows: [],
  mapping: defaultMapping(),
});

const createEmptyDirectImport = () => ({
  hasLineItems: null,
  hasStandardDiscount: null,
  discountPercent: 10,
  pastedData: "",
  parsedData: [],
  headerRowCount: 1,
  columnMappings: [],
  selectedTemplateId: "",
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

const calculateDiscountedPrice = (msrp, discountPercent) => {
  if (!msrp) return "";

  const msrpString = msrp.toString();
  if (msrpString.toLowerCase().includes("all") || msrpString.toLowerCase().includes("see ")) {
    return "N/A";
  }

  const msrpValue = parseCurrency(msrpString);
  const discountValue = parseCurrency(discountPercent?.toString() || "0");

  if (msrpValue === 0 && msrpString.trim() !== "0" && msrpString.trim() !== "$0") {
    return "N/A";
  }

  const finalPrice = msrpValue * (1 - discountValue / 100);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(finalPrice);
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

const ContractPreviewTable = ({ rows, emptyMessage, title }) => {
  const visibleRows = rows.slice(0, CONTRACT_IMPORT_PREVIEW_ROW_LIMIT);

  return (
    <div className="mt-5 rounded-xl border border-[#0e3f4e]/20 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h4 className="flex items-center font-semibold text-[#0e3f4e]">
            <CheckCircle2 size={18} className="mr-2 text-[#7eb03e]" />
            {title}
          </h4>
          <p className="mt-1 text-sm text-gray-600">
            {rows.length === 0
              ? emptyMessage
              : `Showing ${visibleRows.length} of ${rows.length} mapped row${rows.length === 1 ? "" : "s"}.`}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-[1500px] w-full text-left text-xs">
              <colgroup>
                <col className="w-[170px]" />
                <col className="w-[180px]" />
                <col className="w-[270px]" />
                <col className="w-[140px]" />
                <col className="w-[320px]" />
                <col className="w-[110px]" />
                <col className="w-[160px]" />
                <col className="w-[120px]" />
                <col className="w-[130px]" />
              </colgroup>
              <thead className="bg-gray-50 text-gray-600">
                <tr className="border-b border-gray-200 uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Manufacturer</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Website</th>
                  <th className="px-4 py-3 font-semibold">Product Name</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Product #</th>
                  <th className="px-4 py-3 font-semibold">Description</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Units</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">MSRP</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Discount %</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap text-[#0e3f4e]">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleRows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3 text-gray-700">{row.manufacturer || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{row.website || "—"}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.productName || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{row.productNumber || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{row.description || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{row.units || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{row.msrp || "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{row.discount ?? 0}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#0e3f4e]">
                      {calculateDiscountedPrice(row.msrp, row.discount) || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

function ContractImportConfigurator({
  source,
  onChange,
  templates,
  setTemplates,
  previewManufacturer,
  previewWebsite,
  hasStandardDiscount,
  discountPercent,
  emptyPreviewMessage,
}) {
  const [templateName, setTemplateName] = useState("");
  const normalizedSource = useMemo(() => normalizeContractImportSource(source), [source]);
  const parsedPreviewRows = useMemo(
    () =>
      normalizedSource.parsedData.slice(
        0,
        Math.max(CONTRACT_IMPORT_PREVIEW_ROW_LIMIT, normalizedSource.headerRowCount + 3),
      ),
    [normalizedSource],
  );
  const previewRows = useMemo(
    () =>
      buildContractRowsFromImportSource(normalizedSource, {
        manufacturer: previewManufacturer,
        website: previewWebsite,
        hasStandardDiscount,
        discountPercent,
      }),
    [
      normalizedSource,
      previewManufacturer,
      previewWebsite,
      hasStandardDiscount,
      discountPercent,
    ],
  );
  const hasMappedColumns = normalizedSource.columnMappings.some(
    (mapping) => !contractImportMappingIsIgnored(mapping),
  );

  const commitSource = (updates) => {
    onChange(
      normalizeContractImportSource({
        ...normalizedSource,
        ...updates,
      }),
    );
  };

  const handlePasteChange = (text) => {
    const parsedData = parseSpreadsheetText(text);
    const nextHeaderRowCount =
      parsedData.length > 1
        ? Math.min(Math.max(normalizedSource.headerRowCount || 1, 1), parsedData.length - 1)
        : 0;

    commitSource({
      pastedData: text,
      parsedData,
      headerRowCount: nextHeaderRowCount,
      columnMappings: createAutoMappedContractImportColumnMappings(parsedData, nextHeaderRowCount),
      selectedTemplateId: "",
    });
  };

  const handleHeaderRowCountChange = (value) => {
    const maxHeaderRows = Math.max(0, normalizedSource.parsedData.length - 1);
    const nextHeaderRowCount = Math.min(Math.max(value, 0), maxHeaderRows);
    commitSource({
      headerRowCount: nextHeaderRowCount,
      selectedTemplateId: "",
    });
  };

  const updateColumnMapping = (index, updates) => {
    const nextMappings = [...normalizedSource.columnMappings];
    nextMappings[index] = {
      ...normalizeContractImportColumnMapping(nextMappings[index]),
      ...updates,
    };

    commitSource({
      columnMappings: nextMappings,
      selectedTemplateId: "",
    });
  };

  const toggleMappingType = (index, fieldKey) => {
    const currentMapping = normalizeContractImportColumnMapping(normalizedSource.columnMappings[index]);
    const currentTypes = normalizeContractImportMappingTypes(currentMapping);
    const nextTypes = currentTypes.includes(fieldKey)
      ? currentTypes.filter((type) => type !== fieldKey)
      : [...currentTypes, fieldKey];

    updateColumnMapping(index, {
      ...createContractImportColumnMappingState(nextTypes),
    });
  };

  const addFixedColumn = () => {
    commitSource({
      columnMappings: [
        ...normalizedSource.columnMappings,
        {
          ...createEmptyContractImportColumnMapping(),
          isFixed: true,
          customName: `Fixed Column ${normalizedSource.columnMappings.length + 1}`,
        },
      ],
      selectedTemplateId: "",
    });
  };

  const applyTemplateById = (templateId) => {
    const template = templates.find((currentTemplate) => currentTemplate.id === templateId);
    if (!template) {
      commitSource({ selectedTemplateId: "" });
      return;
    }

    const parsedColumnCount = getParsedColumnCount(normalizedSource.parsedData);
    const nextMappings = Array.from(
      { length: Math.max(parsedColumnCount, template.mappings.length) },
      (_, index) =>
        index < template.mappings.length
          ? normalizeContractImportColumnMapping(template.mappings[index])
          : createEmptyContractImportColumnMapping(),
    );
    const maxHeaderRows = Math.max(0, normalizedSource.parsedData.length - 1);
    const requestedHeaderRows =
      typeof template.headerRowCount === "number"
        ? template.headerRowCount
        : normalizedSource.headerRowCount;

    commitSource({
      columnMappings: nextMappings,
      headerRowCount: Math.min(Math.max(requestedHeaderRows, 0), maxHeaderRows),
      selectedTemplateId: template.id,
    });
  };

  const handleSaveTemplate = () => {
    const trimmedName = templateName.trim();
    if (!trimmedName) {
      return;
    }

    const existingTemplate = templates.find(
      (template) => template.name.toLowerCase() === trimmedName.toLowerCase(),
    );
    const nextTemplate = {
      id: existingTemplate?.id || genId(),
      name: trimmedName,
      headerRowCount: normalizedSource.headerRowCount,
      mappings: normalizedSource.columnMappings.map((mapping) => ({
        ...createContractImportColumnMappingState(mapping),
        isFixed: mapping.isFixed === true,
        fixedValue: mapping.fixedValue || "",
        customName: mapping.customName || "",
      })),
    };

    setTemplates((currentTemplates) => {
      if (existingTemplate) {
        return currentTemplates.map((template) =>
          template.id === existingTemplate.id ? nextTemplate : template,
        );
      }

      return [...currentTemplates, nextTemplate];
    });

    commitSource({ selectedTemplateId: nextTemplate.id });
    setTemplateName("");
  };

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-xl border border-[#0e3f4e]/20 bg-[#0e3f4e]/5 p-5">
        <label className="block text-sm font-semibold text-gray-800 mb-2">
          Paste line by line info from your spreadsheet below:
        </label>
        <textarea
          rows={8}
          value={normalizedSource.pastedData}
          onChange={(event) => handlePasteChange(event.target.value)}
          placeholder="Copy from Excel or Google Sheets and paste here..."
          className="w-full rounded-lg border border-gray-300 bg-white p-4 font-mono text-sm outline-none transition-shadow focus:ring-2 focus:ring-[#0e3f4e]"
        />
      </div>

      {(normalizedSource.parsedData.length > 0 || normalizedSource.columnMappings.length > 0) && (
        <>
          <div className="rounded-xl border border-[#0e3f4e]/20 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h4 className="flex items-center font-semibold text-[#0e3f4e]">
                  <Save size={18} className="mr-2 text-[#7eb03e]" />
                  Saved Map Templates
                </h4>
                <p className="mt-1 text-sm text-gray-600">
                  Save this mapping layout and reuse it across future catalog imports.
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 lg:flex-row">
                <select
                  value={normalizedSource.selectedTemplateId || ""}
                  onChange={(event) => applyTemplateById(event.target.value)}
                  disabled={templates.length === 0}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-[#0e3f4e] focus:outline-none focus:ring-2 focus:ring-[#0e3f4e] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="">
                    {templates.length === 0 ? "No saved templates yet" : "Select saved template..."}
                  </option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="Template name"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-[#0e3f4e] focus:outline-none focus:ring-2 focus:ring-[#0e3f4e]"
                />

                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={!hasMappedColumns}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#0e3f4e] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0e3f4e]/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save size={16} className="mr-2" />
                  Save Template
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="block text-sm font-semibold text-gray-800">Map columns to contract fields</label>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={addFixedColumn}
                className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                <Plus size={16} className="mr-1.5" />
                Add Fixed Column
              </button>
              <div className="flex items-center gap-3 border-l border-gray-200 pl-4 text-sm font-medium text-gray-600">
                <label htmlFor={`header-rows-${normalizedSource.selectedTemplateId || "import"}`}>
                  Header Rows:
                </label>
                <input
                  id={`header-rows-${normalizedSource.selectedTemplateId || "import"}`}
                  type="number"
                  min="0"
                  max={Math.max(0, normalizedSource.parsedData.length - 1)}
                  value={normalizedSource.headerRowCount}
                  onChange={(event) =>
                    handleHeaderRowCountChange(Number.parseInt(event.target.value, 10) || 0)
                  }
                  className="w-16 rounded border border-gray-300 px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-[#0e3f4e]"
                />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {normalizedSource.columnMappings.map((mapping, columnIndex) => {
                    const selectedTypes = normalizeContractImportMappingTypes(mapping);
                    const displayLabel = mapping.isFixed
                      ? mapping.customName || `Fixed Column ${columnIndex + 1}`
                      : getCombinedHeaderFromRows(
                          normalizedSource.parsedData,
                          normalizedSource.headerRowCount,
                          columnIndex,
                        );

                    return (
                      <th
                        key={`mapping-${columnIndex}`}
                        className="w-auto max-w-0 border-r border-gray-200 p-3 align-top font-normal last:border-r-0"
                      >
                        <div className="flex min-w-0 flex-col gap-2">
                          <div
                            className={`rounded-lg border p-2 ${
                              selectedTypes.length === 0
                                ? "border-gray-300 bg-white"
                                : "border-emerald-300 bg-emerald-50/70"
                            }`}
                          >
                            <div className="mb-2">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Source Column
                              </div>
                              <div className="mt-1 break-words text-xs font-semibold text-gray-800">
                                {displayLabel}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5">
                              {ESTIMATOR_MAPPING_FIELDS.map((field) => {
                                const isChecked = contractImportMappingHasType(mapping, field.key);

                                return (
                                  <label
                                    key={field.key}
                                    className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 ${
                                      isChecked
                                        ? "border-emerald-300 bg-white text-emerald-900"
                                        : "border-gray-200 bg-white/80 text-gray-600 hover:border-gray-300"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleMappingType(columnIndex, field.key)}
                                      className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="min-w-0 break-words text-[11px] leading-4">
                                      {field.label}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          {mapping.isFixed && (
                            <>
                              <input
                                type="text"
                                value={mapping.customName}
                                onChange={(event) =>
                                  updateColumnMapping(columnIndex, { customName: event.target.value })
                                }
                                placeholder="Fixed column label"
                                className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-[#0e3f4e] focus:outline-none focus:ring-1 focus:ring-[#0e3f4e]"
                              />
                              <input
                                type="text"
                                value={mapping.fixedValue}
                                onChange={(event) =>
                                  updateColumnMapping(columnIndex, { fixedValue: event.target.value })
                                }
                                placeholder="Value for all rows"
                                className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parsedPreviewRows.map((row, rowIndex) => (
                  <tr
                    key={`row-${rowIndex}`}
                    className={
                      rowIndex < normalizedSource.headerRowCount
                        ? "bg-gray-100/70 italic text-gray-400"
                        : "hover:bg-gray-50"
                    }
                  >
                    {normalizedSource.columnMappings.map((mapping, columnIndex) => (
                      <td
                        key={`cell-${rowIndex}-${columnIndex}`}
                        className="max-w-0 whitespace-normal break-words border-r border-gray-100 p-3 align-top text-xs last:border-r-0"
                      >
                        {mapping.isFixed ? (
                          <span className="font-medium text-emerald-700">{mapping.fixedValue || "—"}</span>
                        ) : (
                          row[columnIndex] || ""
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ContractPreviewTable
            rows={previewRows}
            emptyMessage={
              hasMappedColumns
                ? emptyPreviewMessage
                : "Choose at least one destination field to preview the resulting contract rows."
            }
            title="Preview of Resulting Contract Rows"
          />
        </>
      )}
    </div>
  );
}

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
  const [page, setPage] = useState(() => getCurrentPage());
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
  const [estimatorBooks, setEstimatorBooks] = useState(() =>
    normalizeStoredBooks(readJsonStorage(ESTIMATOR_BOOKS_STORAGE_KEY, [])),
  );
  const [useExistingBook, setUseExistingBook] = useState(null);
  const [selectedEstimatorBookId, setSelectedEstimatorBookId] = useState(null);
  const [selectedEstimatorBookSnapshot, setSelectedEstimatorBookSnapshot] = useState(null);
  const [selectedEstimatorGroupIds, setSelectedEstimatorGroupIds] = useState([]);
  const [estimatorPricingMode, setEstimatorPricingMode] = useState(null);
  const [estimatorImportMapping, setEstimatorImportMapping] = useState(null);
  const [estimatorImportManufacturer, setEstimatorImportManufacturer] = useState("");
  const [estimatorImportWebsite, setEstimatorImportWebsite] = useState("");
  const [contractImportTemplates, setContractImportTemplates] = useState(() =>
    normalizeStoredContractImportTemplates(readJsonStorage(CONTRACT_IMPORT_TEMPLATES_STORAGE_KEY, [])),
  );
  const [tableData, setTableData] = useState([]);
  const [annotations, setAnnotations] = useState({ global: "", rows: {} });

  useEffect(() => {
    writeJsonStorage(STORAGE_KEY, savedModules);
  }, [savedModules]);

  useEffect(() => {
    writeJsonStorage(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    writeJsonStorage(CONTRACT_IMPORT_TEMPLATES_STORAGE_KEY, contractImportTemplates);
  }, [contractImportTemplates]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncPageFromLocation = () => {
      setPage(getCurrentPage());
    };

    window.addEventListener("hashchange", syncPageFromLocation);
    window.addEventListener("popstate", syncPageFromLocation);

    return () => {
      window.removeEventListener("hashchange", syncPageFromLocation);
      window.removeEventListener("popstate", syncPageFromLocation);
    };
  }, []);

  const refreshEstimatorBooks = () => {
    setEstimatorBooks(normalizeStoredBooks(readJsonStorage(ESTIMATOR_BOOKS_STORAGE_KEY, [])));
  };

  useEffect(() => {
    if (page !== "estimator") {
      refreshEstimatorBooks();
    }
  }, [page]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleEstimatorBooksRefresh = () => {
      refreshEstimatorBooks();
    };

    window.addEventListener("focus", handleEstimatorBooksRefresh);
    window.addEventListener("storage", handleEstimatorBooksRefresh);

    return () => {
      window.removeEventListener("focus", handleEstimatorBooksRefresh);
      window.removeEventListener("storage", handleEstimatorBooksRefresh);
    };
  }, []);

  const getSelectedEstimatorBook = () =>
    estimatorBooks.find((book) => book.id === selectedEstimatorBookId) ?? selectedEstimatorBookSnapshot;

  const getEstimatorBookGroupIds = (book) =>
    Array.isArray(book?.groups) ? book.groups.map((group) => group.id) : [];

  const getEstimatorBookItemCountForGroups = (book, groupIds) => {
    if (!Array.isArray(book?.groups)) {
      return 0;
    }

    const selectedGroupIds = Array.isArray(groupIds) ? new Set(groupIds) : null;

    return book.groups.reduce((total, group) => {
      if (selectedGroupIds && !selectedGroupIds.has(group.id)) {
        return total;
      }

      return total + (Array.isArray(group.items) ? group.items.length : 0);
    }, 0);
  };

  const applyEstimatorGroupSelection = (book, groupIds = null) => {
    const availableGroupIds = getEstimatorBookGroupIds(book);

    if (!Array.isArray(groupIds)) {
      setSelectedEstimatorGroupIds(availableGroupIds);
      return;
    }

    setSelectedEstimatorGroupIds(availableGroupIds.filter((groupId) => groupIds.includes(groupId)));
  };

  const getCurrentEstimatorImportConfig = (book = getSelectedEstimatorBook()) => {
    if (!book) {
      return null;
    }

    return getEstimatorBookImportConfig(book, {
      groupIds: selectedEstimatorGroupIds,
      pricingMode: estimatorPricingMode,
    });
  };

  const reconcileEstimatorImportMapping = (currentMapping, config) => {
    if (!config) {
      return null;
    }

    const nextMapping = {};

    ESTIMATOR_BOOK_IMPORT_MAPPING_FIELDS.forEach(({ key, allowFixed }) => {
      const validOptionIds = new Set(config.fieldOptions[key].map((option) => option.id));
      const currentValue = currentMapping?.[key];
      const isValidFixedValue = allowFixed && currentValue === getEstimatorImportFixedSourceId(key);

      if (
        currentValue === ESTIMATOR_IMPORT_IGNORE_SOURCE_ID ||
        validOptionIds.has(currentValue) ||
        isValidFixedValue
      ) {
        nextMapping[key] = currentValue;
        return;
      }

      nextMapping[key] = config.defaultMapping[key];
    });

    return nextMapping;
  };

  useEffect(() => {
    if (!useExistingBook) {
      setEstimatorImportMapping(null);
      return;
    }

    const config = getCurrentEstimatorImportConfig();
    if (!config) {
      setEstimatorImportMapping(null);
      return;
    }

    setEstimatorImportMapping((currentMapping) =>
      reconcileEstimatorImportMapping(currentMapping, config),
    );
  }, [
    useExistingBook,
    estimatorBooks,
    selectedEstimatorBookId,
    selectedEstimatorBookSnapshot,
    selectedEstimatorGroupIds,
    estimatorPricingMode,
  ]);

  const handleUseExistingBookChange = (value) => {
    setUseExistingBook(value);

    if (!value) {
      setSelectedEstimatorBookId(null);
      setSelectedEstimatorBookSnapshot(null);
      setSelectedEstimatorGroupIds([]);
      setEstimatorPricingMode(null);
      setEstimatorImportMapping(null);
      setEstimatorImportManufacturer("");
      setEstimatorImportWebsite("");
      return;
    }

    const nextBook =
      estimatorBooks.find((book) => book.id === selectedEstimatorBookId) ?? estimatorBooks[0] ?? null;

    if (nextBook) {
      setSelectedEstimatorBookId(nextBook.id);
      setSelectedEstimatorBookSnapshot(cloneData(nextBook));
      applyEstimatorGroupSelection(nextBook);
      setEstimatorPricingMode(null);
      setEstimatorImportMapping(null);
      return;
    }

    if (selectedEstimatorBookSnapshot?.id) {
      setSelectedEstimatorBookId(selectedEstimatorBookSnapshot.id);
      applyEstimatorGroupSelection(selectedEstimatorBookSnapshot);
      setEstimatorImportMapping(null);
    }
  };

  const handleEstimatorBookSelect = (bookId) => {
    setSelectedEstimatorBookId(bookId);
    setEstimatorPricingMode(null);
    setEstimatorImportMapping(null);

    const selectedBook =
      estimatorBooks.find((book) => book.id === bookId) ??
      (selectedEstimatorBookSnapshot?.id === bookId ? selectedEstimatorBookSnapshot : null);

    if (selectedBook) {
      if (estimatorBooks.some((book) => book.id === bookId)) {
        setSelectedEstimatorBookSnapshot(cloneData(selectedBook));
      }
      applyEstimatorGroupSelection(selectedBook);
    }
  };

  const handleToggleEstimatorGroup = (groupId) => {
    const selectedBook = getSelectedEstimatorBook();
    const orderedGroupIds = getEstimatorBookGroupIds(selectedBook);

    setSelectedEstimatorGroupIds((currentGroupIds) => {
      const nextSelection = new Set(currentGroupIds);

      if (nextSelection.has(groupId)) {
        nextSelection.delete(groupId);
      } else {
        nextSelection.add(groupId);
      }

      return orderedGroupIds.filter((currentGroupId) => nextSelection.has(currentGroupId));
    });
  };

  const handleSelectAllEstimatorGroups = () => {
    applyEstimatorGroupSelection(getSelectedEstimatorBook());
  };

  const handleClearEstimatorGroups = () => {
    setSelectedEstimatorGroupIds([]);
  };

  const handleEstimatorImportMappingChange = (fieldKey, sourceId) => {
    setEstimatorImportMapping((currentMapping) => ({
      ...(currentMapping || {}),
      [fieldKey]: sourceId,
    }));
  };

  const navigateToPage = (nextPage, options = {}) => {
    const { replace = false } = options;

    if (typeof window === "undefined") {
      setPage(nextPage);
      return;
    }

    const currentPage = getCurrentPage();
    if (currentPage === nextPage) {
      setPage(nextPage);
      return;
    }

    const nextUrl =
      nextPage === "estimator"
        ? `${window.location.pathname}${window.location.search}${ESTIMATOR_HASH}`
        : `${window.location.pathname}${window.location.search}`;

    const historyMethod = replace ? "replaceState" : "pushState";
    window.history[historyMethod]({}, "", nextUrl);
    setPage(nextPage);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const resetWizard = () => {
    refreshEstimatorBooks();
    setEditingId(null);
    setConfirmingSubmit(false);
    setVendorName("");
    setContractName("");
    setType1("");
    setUsingThirdParty(null);
    setCatalogs([createEmptyCatalog()]);
    setDirectImport(createEmptyDirectImport());
    setUseExistingBook(null);
    setSelectedEstimatorBookId(null);
    setSelectedEstimatorBookSnapshot(null);
    setSelectedEstimatorGroupIds([]);
    setEstimatorPricingMode(null);
    setEstimatorImportMapping(null);
    setEstimatorImportManufacturer("");
    setEstimatorImportWebsite("");
    setTableData([]);
    setAnnotations({ global: "", rows: {} });
    setStep(0);
  };

  const saveModule = (newStatus = null) => {
    const existingModule = editingId ? savedModules.find((module) => module.id === editingId) : null;
    const status = newStatus || existingModule?.status || "Draft";
    const currentSelectedEstimatorBook = useExistingBook ? getSelectedEstimatorBook() : null;
    const resolvedEstimatorBookSnapshot = currentSelectedEstimatorBook
      ? cloneData(currentSelectedEstimatorBook)
      : null;

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
      useExistingBook,
      selectedEstimatorBookId,
      selectedEstimatorBookSnapshot: resolvedEstimatorBookSnapshot,
      selectedEstimatorGroupIds,
      estimatorPricingMode,
      estimatorImportMapping,
      estimatorImportManufacturer,
      estimatorImportWebsite,
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
    refreshEstimatorBooks();
    setEditingId(module.id);
    setContractName(module.name);
    setVendorName(module.vendor);
    setType1(module.type);
    setTableData(cloneData(module.data || []));

    if (module.usingThirdParty !== undefined) setUsingThirdParty(module.usingThirdParty);
    if (module.catalogs) {
      setCatalogs(cloneData(module.catalogs).map((catalog) => normalizeContractImportSource(catalog)));
    }
    if (module.directImport) setDirectImport(normalizeContractImportSource(cloneData(module.directImport)));
    setUseExistingBook(module.useExistingBook ?? null);
    setSelectedEstimatorBookId(module.selectedEstimatorBookId ?? null);
    setSelectedEstimatorBookSnapshot(
      module.selectedEstimatorBookSnapshot ? cloneData(module.selectedEstimatorBookSnapshot) : null,
    );
    applyEstimatorGroupSelection(
      module.selectedEstimatorBookSnapshot ??
        estimatorBooks.find((book) => book.id === module.selectedEstimatorBookId) ??
        null,
      Array.isArray(module.selectedEstimatorGroupIds) ? module.selectedEstimatorGroupIds : null,
    );
    setEstimatorPricingMode(module.estimatorPricingMode ?? null);
    setEstimatorImportMapping(module.estimatorImportMapping ? cloneData(module.estimatorImportMapping) : null);
    setEstimatorImportManufacturer(module.estimatorImportManufacturer ?? "");
    setEstimatorImportWebsite(module.estimatorImportWebsite ?? "");

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

  const updateCatalogImportSource = (catalogId, nextSource) => {
    setCatalogs((prev) =>
      prev.map((catalog) =>
        catalog.id === catalogId ? { ...catalog, ...normalizeContractImportSource(nextSource) } : catalog,
      ),
    );
  };

  const updateDirectImportSource = (nextSource) => {
    setDirectImport((prev) => ({
      ...prev,
      ...normalizeContractImportSource(nextSource),
    }));
  };

  const generateTable = () => {
    const newTable = [];
    const selectedEstimatorBook = useExistingBook ? getSelectedEstimatorBook() : null;

    if (selectedEstimatorBook) {
      newTable.push(
        ...buildPart1RowsFromEstimatorBook(selectedEstimatorBook, vendorName, {
          groupIds: selectedEstimatorGroupIds,
          mapping: estimatorImportMapping,
          pricingMode: estimatorPricingMode,
          manufacturer: estimatorImportManufacturer,
          website: estimatorImportWebsite,
        }),
      );
    }

    if (usingThirdParty) {
      catalogs.forEach((catalog) => {
        const normalizedCatalog = normalizeContractImportSource(catalog);

        if (catalog.hasLineItems && normalizedCatalog.rows.length > 0) {
          newTable.push(
            ...buildContractRowsFromImportSource(normalizedCatalog, {
              manufacturer: catalog.manufacturer,
              website: catalog.link,
              hasStandardDiscount: catalog.hasStandardDiscount,
              discountPercent: catalog.discountPercent,
            }),
          );
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

    if (directImport.hasLineItems && normalizeContractImportSource(directImport).rows.length > 0) {
      newTable.push(
        ...buildContractRowsFromImportSource(directImport, {
          manufacturer: vendorName,
          website: "",
          hasStandardDiscount: directImport.hasStandardDiscount,
          discountPercent: directImport.discountPercent,
        }),
      );
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
    const showExistingBookQuestion =
      estimatorBooks.length > 0 || useExistingBook === true || Boolean(selectedEstimatorBookSnapshot);
    const selectedEstimatorBook = useExistingBook ? getSelectedEstimatorBook() : null;
    const estimatorImportConfig = selectedEstimatorBook
      ? getCurrentEstimatorImportConfig(selectedEstimatorBook)
      : null;
    const selectedEstimatorBookSummary = selectedEstimatorBook
      ? summarizeEstimatorBookForPart1Import(selectedEstimatorBook, {
          groupIds: selectedEstimatorGroupIds,
        })
      : null;
    const selectedBookExistsInEstimator = estimatorBooks.some(
      (book) => book.id === selectedEstimatorBookId,
    );
    const selectedEstimatorGroupCount = selectedEstimatorGroupIds.length;
    const totalEstimatorGroupCount = selectedEstimatorBook?.groups?.length ?? 0;
    const selectedEstimatorItemCount = selectedEstimatorBook
      ? getEstimatorBookItemCountForGroups(selectedEstimatorBook, selectedEstimatorGroupIds)
      : 0;
    const hasEstimatorGroupsToChoose = totalEstimatorGroupCount > 0;
    const hasSelectedEstimatorGroups = !hasEstimatorGroupsToChoose || selectedEstimatorGroupCount > 0;
    const requiresEstimatorPricingQuestion =
      (selectedEstimatorBookSummary?.discountedItemCount ?? 0) > 0;
    const shouldShowEstimatorMapping =
      Boolean(selectedEstimatorBook) &&
      hasSelectedEstimatorGroups &&
      (!requiresEstimatorPricingQuestion || Boolean(estimatorPricingMode)) &&
      Boolean(estimatorImportConfig);
    const estimatorPreviewRows =
      shouldShowEstimatorMapping && selectedEstimatorBook
        ? buildPart1RowsFromEstimatorBook(selectedEstimatorBook, vendorName, {
            groupIds: selectedEstimatorGroupIds,
            mapping: estimatorImportMapping,
            pricingMode: estimatorPricingMode,
            manufacturer: estimatorImportManufacturer,
            website: estimatorImportWebsite,
          })
        : [];
    const normalizedDirectImport = normalizeContractImportSource(directImport);
    const catalogQuestionNumber = showExistingBookQuestion ? 5 : 4;
    const directImportQuestionNumber = showExistingBookQuestion ? 6 : 5;

    const renderEstimatorColumnsUI = ({ config, mapping, onMapChange, previewRows }) => (
      <div className="mt-5 rounded-xl border border-[#0e3f4e]/20 bg-white p-5 shadow-sm">
        <h4 className="font-semibold text-[#0e3f4e] mb-2 flex items-center">
          <CheckCircle2 size={18} className="mr-2 text-[#7eb03e]" />
          Confirm Book Field Mapping
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          We guessed how the selected estimator groups should map into the Part 1 contract. Review
          each field before creating the table.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {ESTIMATOR_MAPPING_FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col">
              <label className="mb-2 flex min-h-[3rem] items-end text-xs font-bold uppercase tracking-wider text-gray-600">
                {field.label}
              </label>
              <select
                value={mapping?.[field.key] ?? ESTIMATOR_IMPORT_IGNORE_SOURCE_ID}
                onChange={(event) => onMapChange(field.key, event.target.value)}
                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-[#0e3f4e] focus:ring-[#0e3f4e] py-2"
              >
                <option value={ESTIMATOR_IMPORT_IGNORE_SOURCE_ID}>-- Ignore --</option>
                {config.fieldOptions[field.key].map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.optionLabel}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-dashed border-[#0e3f4e]/20 bg-[#0e3f4e]/[0.03] p-4">
          <div className="mb-3">
            <div className="text-sm font-semibold text-[#0e3f4e]">Optional Contract Fields</div>
            <p className="mt-1 text-sm text-gray-600">
              These do not change your custom book schema. Use them only if you want Manufacturer or
              Website to come from a mapped info field, or from one shared value for every imported
              row.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ESTIMATOR_BOOK_OPTIONAL_FIELDS.map((field) => (
              <div key={field.key} className="flex flex-col">
                <label className="mb-2 flex min-h-[3rem] items-end text-xs font-bold uppercase tracking-wider text-gray-600">
                  {field.label}
                </label>
                <select
                  value={mapping?.[field.key] ?? ESTIMATOR_IMPORT_IGNORE_SOURCE_ID}
                  onChange={(event) => onMapChange(field.key, event.target.value)}
                  className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-[#0e3f4e] focus:ring-[#0e3f4e] py-2"
                >
                  <option value={ESTIMATOR_IMPORT_IGNORE_SOURCE_ID}>-- Leave Blank --</option>
                  <option value={getEstimatorImportFixedSourceId(field.key)}>
                    Use one value for all rows
                  </option>
                  {config.fieldOptions[field.key].map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.optionLabel}
                    </option>
                  ))}
                </select>
                {field.key === "manufacturer" &&
                  mapping?.[field.key] === getEstimatorImportFixedSourceId(field.key) && (
                    <input
                      type="text"
                      value={estimatorImportManufacturer}
                      onChange={(event) => setEstimatorImportManufacturer(event.target.value)}
                      placeholder="Manufacturer for all imported rows"
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#0e3f4e] focus:outline-none focus:ring-2 focus:ring-[#0e3f4e]"
                    />
                  )}
                {field.key === "website" &&
                  mapping?.[field.key] === getEstimatorImportFixedSourceId(field.key) && (
                    <input
                      type="url"
                      value={estimatorImportWebsite}
                      onChange={(event) => setEstimatorImportWebsite(event.target.value)}
                      placeholder="Website for all imported rows"
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#0e3f4e] focus:outline-none focus:ring-2 focus:ring-[#0e3f4e]"
                    />
                  )}
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Tip: choose a specific amount source such as `Amount: Price/Ctn` for MSRP and a matching
          estimator discount source for `% Discount` when your book stores multiple price fields.
        </p>

        <ContractPreviewTable
          rows={previewRows}
          emptyMessage="Choose a saved book and mapped fields to preview the contract rows this import will create."
          title="Preview of Imported Book Rows"
        />
      </div>
    );

    const canProceed =
      usingThirdParty !== null &&
      directImport.hasLineItems !== null &&
      (!showExistingBookQuestion || useExistingBook !== null) &&
      (!useExistingBook || (Boolean(selectedEstimatorBook) && hasSelectedEstimatorGroups)) &&
      (!requiresEstimatorPricingQuestion || Boolean(estimatorPricingMode)) &&
      (!shouldShowEstimatorMapping || Boolean(estimatorImportMapping));

    return (
      <div className="mx-auto w-[min(96vw,1800px)] animate-in slide-in-from-right-8 fade-in duration-300">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
          <div className="flex items-center mb-6 text-[#0e3f4e]">
            <LayoutList className="mr-3" size={28} />
            <h2 className="text-2xl font-bold text-gray-900">Catalog & Import Details</h2>
          </div>

          {showExistingBookQuestion && (
            <div className="mb-8 border-b border-gray-100 pb-8">
              <label className="block text-base font-semibold text-gray-800 mb-3">
                4. Would you like to use an existing book?
              </label>
              <YesNoToggle value={useExistingBook} onChange={handleUseExistingBookChange} />

              {useExistingBook === true && (
                <div className="mt-6 rounded-xl border border-[#0e3f4e]/20 bg-[#0e3f4e]/5 p-5 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        Select a saved estimator book and its items will be added to the Part 1
                        table when you finish this step.
                      </p>
                      {selectedEstimatorBook && (
                        <p className="mt-2 text-xs font-medium uppercase tracking-wider text-[#0e3f4e]">
                          {hasEstimatorGroupsToChoose ? selectedEstimatorGroupCount : totalEstimatorGroupCount} of{" "}
                          {totalEstimatorGroupCount} groups selected ·{" "}
                          {hasEstimatorGroupsToChoose
                            ? selectedEstimatorItemCount
                            : getBookItemCount(selectedEstimatorBook)}{" "}
                          items
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => navigateToPage("estimator")}
                      className="inline-flex items-center rounded-lg border border-[#0e3f4e]/20 bg-white px-4 py-2 text-sm font-semibold text-[#0e3f4e] shadow-sm transition-colors hover:bg-[#0e3f4e]/5"
                    >
                      <BookOpen size={16} className="mr-2" /> Open Estimator
                    </button>
                  </div>

                  {estimatorBooks.length > 0 ? (
                    <>
                      <label className="mt-5 block text-sm font-semibold text-gray-700 mb-2">
                        Choose a saved book
                      </label>
                      <select
                        value={selectedEstimatorBookId || ""}
                        onChange={(event) => handleEstimatorBookSelect(event.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-[#0e3f4e] focus:outline-none focus:ring-2 focus:ring-[#0e3f4e]"
                      >
                        {!selectedEstimatorBookId && <option value="">Select a book</option>}
                        {useExistingBook &&
                          selectedEstimatorBookId &&
                          !selectedBookExistsInEstimator &&
                          selectedEstimatorBookSnapshot && (
                            <option value={selectedEstimatorBookId}>
                              {selectedEstimatorBookSnapshot.name} (saved snapshot)
                            </option>
                          )}
                        {estimatorBooks.map((book) => (
                          <option key={book.id} value={book.id}>
                            {book.name} ({book.groups.length} groups, {getBookItemCount(book)} items)
                          </option>
                        ))}
                      </select>
                    </>
                  ) : selectedEstimatorBookSnapshot ? (
                    <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      This contract will use the saved snapshot of{" "}
                      <strong>{selectedEstimatorBookSnapshot.name}</strong> because that book is no
                      longer available in the estimator.
                    </div>
                  ) : (
                    <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      No saved estimator books are available yet. Create one in the estimator or
                      switch this answer to No.
                    </div>
                  )}

                  {selectedEstimatorBook &&
                    estimatorBooks.length > 0 &&
                    !selectedBookExistsInEstimator &&
                    selectedEstimatorBookSnapshot && (
                      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        The originally selected book is missing from the estimator, so the saved
                        snapshot will be used unless you choose a different book above.
                      </div>
                    )}

                  {selectedEstimatorBook && hasEstimatorGroupsToChoose && (
                    <div className="mt-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <label className="block text-sm font-semibold text-gray-800">
                            Choose which groups to import
                          </label>
                          <p className="mt-1 text-sm text-gray-600">
                            All groups are selected by default. Uncheck any groups you do not want
                            in this contract.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleSelectAllEstimatorGroups}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-[#0e3f4e] hover:text-[#0e3f4e]"
                          >
                            Select All
                          </button>
                          <button
                            onClick={handleClearEstimatorGroups}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-[#0e3f4e] hover:text-[#0e3f4e]"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {selectedEstimatorBook.groups.map((group) => {
                          const isSelected = selectedEstimatorGroupIds.includes(group.id);
                          const itemCount = Array.isArray(group.items) ? group.items.length : 0;

                          return (
                            <label
                              key={group.id}
                              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
                                isSelected
                                  ? "border-[#0e3f4e] bg-[#0e3f4e]/10 shadow-sm"
                                  : "border-gray-200 bg-white hover:border-[#0e3f4e]/30 hover:bg-[#0e3f4e]/5"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleEstimatorGroup(group.id)}
                                className="mt-1 h-4 w-4 rounded border-gray-300 text-[#0e3f4e] focus:ring-[#0e3f4e]"
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-gray-900">{group.name}</div>
                                <div className="text-sm text-gray-600">
                                  {itemCount} item{itemCount === 1 ? "" : "s"}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      {!hasSelectedEstimatorGroups && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                          Select at least one estimator group to import.
                        </div>
                      )}
                    </div>
                  )}

                  {selectedEstimatorBook && !hasEstimatorGroupsToChoose && (
                    <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      This saved book does not have any groups yet, so there is nothing to import
                      from it right now.
                    </div>
                  )}

                  {selectedEstimatorBook && requiresEstimatorPricingQuestion && (
                    <div className="mt-5 rounded-lg border border-amber-200 bg-white p-4 shadow-sm">
                      <label className="block text-sm font-semibold text-gray-800 mb-2">
                        This book already includes estimator discounts on{" "}
                        {selectedEstimatorBookSummary.discountedItemCount} item
                        {selectedEstimatorBookSummary.discountedItemCount === 1 ? "" : "s"}. How
                        should those items be imported?
                      </label>
                      <div className="grid gap-3 md:grid-cols-2">
                        <button
                          onClick={() => setEstimatorPricingMode("contract_discount")}
                          className={`rounded-xl border p-4 text-left transition-all ${
                            estimatorPricingMode === "contract_discount"
                              ? "border-[#0e3f4e] bg-[#0e3f4e]/10 ring-1 ring-[#0e3f4e]"
                              : "border-gray-200 bg-white hover:border-[#0e3f4e]/40 hover:bg-[#0e3f4e]/5"
                          }`}
                        >
                          <div className="text-sm font-semibold text-gray-900">
                            Import MSRP + Discount
                          </div>
                          <p className="mt-1 text-sm text-gray-600">
                            Use the estimator pre-discount amount as MSRP and carry the effective
                            estimator discount into the contract&apos;s % Discount field.
                          </p>
                        </button>
                        <button
                          onClick={() => setEstimatorPricingMode("final_price")}
                          className={`rounded-xl border p-4 text-left transition-all ${
                            estimatorPricingMode === "final_price"
                              ? "border-[#0e3f4e] bg-[#0e3f4e]/10 ring-1 ring-[#0e3f4e]"
                              : "border-gray-200 bg-white hover:border-[#0e3f4e]/40 hover:bg-[#0e3f4e]/5"
                          }`}
                        >
                          <div className="text-sm font-semibold text-gray-900">
                            Import Final Price Only
                          </div>
                          <p className="mt-1 text-sm text-gray-600">
                            Import the estimator&apos;s already-discounted final total as
                            MSRP/Pricing and leave the contract discount at 0%.
                          </p>
                        </button>
                      </div>

                      {selectedEstimatorBookSummary.fallbackDiscountItemCount > 0 && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                          {selectedEstimatorBookSummary.fallbackDiscountItemCount} discounted item
                          {selectedEstimatorBookSummary.fallbackDiscountItemCount === 1 ? "" : "s"}{" "}
                          do not auto-convert cleanly into a single contract discount. Review the
                          mapping below and choose the exact MSRP and discount sources you want to
                          use.
                        </div>
                      )}
                    </div>
                  )}

                  {shouldShowEstimatorMapping && estimatorImportConfig && estimatorImportMapping && (
                    renderEstimatorColumnsUI({
                      config: estimatorImportConfig,
                      mapping: estimatorImportMapping,
                      onMapChange: handleEstimatorImportMappingChange,
                      previewRows: estimatorPreviewRows,
                    })
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-base font-semibold text-gray-800 mb-3">
              {catalogQuestionNumber}. Are you using any 3rd party catalogs?
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
                        <ContractImportConfigurator
                          source={normalizeContractImportSource(catalog)}
                          onChange={(nextSource) => updateCatalogImportSource(catalog.id, nextSource)}
                          templates={contractImportTemplates}
                          setTemplates={setContractImportTemplates}
                          previewManufacturer={catalog.manufacturer}
                          previewWebsite={catalog.link}
                          hasStandardDiscount={catalog.hasStandardDiscount}
                          discountPercent={catalog.discountPercent}
                          emptyPreviewMessage="Map at least one catalog column to preview how these rows will land in the Part 1 table."
                        />
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
              {directImportQuestionNumber}. Do you have any {usingThirdParty ? "additional " : ""}
              line items to import directly (not from a 3rd party catalog)?
            </label>
            <YesNoToggle
              value={directImport.hasLineItems}
              onChange={(value) => setDirectImport((prev) => ({ ...prev, hasLineItems: value }))}
            />

            {directImport.hasLineItems === false && !usingThirdParty && !selectedEstimatorBook && (
              <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200 flex items-start text-sm text-amber-800 animate-in fade-in">
                <Info className="mr-2 shrink-0 mt-0.5" size={16} />
                <p>
                  If you have no catalogs and no line items to import, your Part 1 Contract will be
                  created with a blank table for you to manually add rows.
                </p>
              </div>
            )}

            {directImport.hasLineItems === false && !usingThirdParty && selectedEstimatorBook && (
              <div className="mt-6 p-4 bg-emerald-50 rounded-lg border border-emerald-200 flex items-start text-sm text-emerald-800 animate-in fade-in">
                <CheckCircle2 className="mr-2 shrink-0 mt-0.5" size={16} />
                <p>
                  Your selected estimator book will populate the Part 1 table even without
                  additional direct imports or 3rd party catalogs.
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

                <ContractImportConfigurator
                  source={normalizedDirectImport}
                  onChange={updateDirectImportSource}
                  templates={contractImportTemplates}
                  setTemplates={setContractImportTemplates}
                  previewManufacturer={vendorName}
                  previewWebsite=""
                  hasStandardDiscount={directImport.hasStandardDiscount}
                  discountPercent={directImport.discountPercent}
                  emptyPreviewMessage="Map at least one imported column to preview the contract rows that will be created."
                />
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

  if (page === "estimator") {
    return <EstimatorPage onBack={() => navigateToPage("contracts", { replace: true })} />;
  }

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

      <button
        onClick={() => navigateToPage("estimator")}
        className="fixed bottom-5 left-5 z-20 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#0e3f4e] text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-[#125366] hover:shadow-xl"
        title="Open Flexible Estimator"
        aria-label="Open Flexible Estimator"
      >
        <BookOpen size={18} />
      </button>
    </div>
  );
}
