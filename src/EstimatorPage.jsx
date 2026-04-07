import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Calculator,
  Edit3,
  Eye,
  EyeOff,
  Info,
  Percent,
  Plus,
  Search,
  Settings2,
  TableProperties,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";

const generateId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

const roundToTwo = (num) => Math.round(num * 100) / 100;

const PRICING_STATUS_OPTIONS = [
  { value: "priced", label: "Priced" },
  { value: "non_priced", label: "Non-Priced" },
  { value: "does_not_apply", label: "Does not apply" },
];

const PRICING_STATUS_LABELS = PRICING_STATUS_OPTIONS.reduce((labels, option) => {
  labels[option.value] = option.label;
  return labels;
}, {});

const IMPORT_NOTE_MIN_LENGTH = 20;
const ACTIONS_COLUMN_WIDTH = 140;
const MIN_TABLE_COLUMN_WIDTH = 110;
export const ESTIMATOR_BOOKS_STORAGE_KEY = "part1module:estimator-books:v1";
const ESTIMATOR_ACTIVE_BOOK_STORAGE_KEY = "part1module:estimator-active-book:v1";
const ESTIMATOR_COLUMNS_STORAGE_KEY = "part1module:estimator-columns:v1";
const ESTIMATOR_IMPORT_TEMPLATES_STORAGE_KEY = "part1module:estimator-import-templates:v1";
const TABLE_COLUMN_DEFINITIONS = [
  { id: "itemNumber", label: "Item #", width: 150, align: "left" },
  { id: "itemName", label: "Item Name", width: 220, align: "left" },
  { id: "description", label: "Description", width: 340, align: "left" },
  { id: "uom", label: "UOM", width: 120, align: "left" },
  { id: "pricingStatus", label: "Status", width: 160, align: "left" },
  { id: "material", label: "Material", width: 140, align: "right" },
  { id: "labor", label: "Labor", width: 140, align: "right" },
  { id: "equipment", label: "Equipment", width: 140, align: "right" },
  { id: "amounts", label: "Additional Amounts", width: 260, align: "left" },
  { id: "discounts", label: "Discounts", width: 240, align: "left" },
  { id: "info", label: "Info", width: 260, align: "left" },
  { id: "baseSubtotal", label: "Base Subtotal", width: 160, align: "right" },
  { id: "calculatedTotal", label: "Calculated Total", width: 180, align: "right" },
  { id: "totalMode", label: "Total Mode", width: 130, align: "left" },
  { id: "finalTotal", label: "Final Total", width: 160, align: "right" },
];

const createDefaultTableColumns = () =>
  TABLE_COLUMN_DEFINITIONS.map((column) => ({ ...column, visible: true }));

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
    // Ignore storage failures.
  }
};

export const normalizeStoredBooks = (storedBooks) =>
  Array.isArray(storedBooks) ? storedBooks.map(normalizeStoredBook) : [];

const normalizeStoredImportTemplates = (storedTemplates) => {
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

const normalizeStoredTableColumns = (storedColumns) => {
  const defaultColumns = createDefaultTableColumns();

  if (!Array.isArray(storedColumns)) {
    return defaultColumns;
  }

  const defaultColumnMap = new Map(defaultColumns.map((column) => [column.id, column]));
  const orderedStoredColumns = storedColumns
    .filter((column) => defaultColumnMap.has(column.id))
    .map((column) => ({
      ...defaultColumnMap.get(column.id),
      ...column,
      width:
        typeof column.width === "number"
          ? Math.max(MIN_TABLE_COLUMN_WIDTH, column.width)
          : defaultColumnMap.get(column.id).width,
      visible: column.visible !== false,
    }));

  const presentIds = new Set(orderedStoredColumns.map((column) => column.id));

  return [
    ...orderedStoredColumns,
    ...defaultColumns.filter((column) => !presentIds.has(column.id)),
  ];
};

const createEmptyEstimatorItem = (itemNumber = "") => ({
  id: generateId(),
  itemNumber,
  itemName: "",
  description: "",
  uom: "",
  material: "",
  labor: "",
  equipment: "",
  others: [],
  pricingStatus: "priced",
});

const createCustomGroup = (name) => ({
  id: generateId(),
  name,
  itemNumberPrefix: "",
  itemNumberSuffix: "",
  items: [],
});

const createCustomBook = (name) => ({
  id: generateId(),
  name,
  groups: [],
});

const calculateItemTotals = (item) => {
  const mat = parseFloat(item.material) || 0;
  const lab = parseFloat(item.labor) || 0;
  const eq = parseFloat(item.equipment) || 0;

  const baseTotal = mat + lab + eq;
  let otherAmountsTotal = 0;
  let discountsTotal = 0;

  const amounts = item.others.filter((other) => other.type === "amount" && other.isActive !== false);
  const discounts = item.others.filter(
    (other) => other.type === "discount" && other.isActive !== false,
  );

  amounts.forEach((amount) => {
    otherAmountsTotal += parseFloat(amount.value) || 0;
  });

  const getTargetValue = (targetId) => {
    if (targetId === "material") return mat;
    if (targetId === "labor") return lab;
    if (targetId === "equipment") return eq;

    const customAmount = amounts.find((amount) => amount.id === targetId);
    return customAmount ? parseFloat(customAmount.value) || 0 : 0;
  };

  discounts.forEach((discount) => {
    const pct = (parseFloat(discount.percent) || 0) / 100;
    let currentDiscountValue = 0;

    if (discount.rounding === "round_first") {
      discount.targets.forEach((targetId) => {
        const value = getTargetValue(targetId);
        currentDiscountValue += roundToTwo(value * pct);
      });
    } else {
      let sum = 0;
      discount.targets.forEach((targetId) => {
        sum += getTargetValue(targetId);
      });
      currentDiscountValue = roundToTwo(sum * pct);
    }

    discountsTotal += currentDiscountValue;
  });

  const calculatedTotal = baseTotal + otherAmountsTotal - discountsTotal;

  return { calculatedTotal, discountsTotal, baseTotal, otherAmountsTotal };
};

const createAdjustmentAmount = (name = "Adjustment", value = "") => ({
  id: generateId(),
  type: "amount",
  name,
  value,
  isActive: true,
  isAdjustment: true,
});

const normalizeTextValue = (value) => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
};

const getGroupItemNumber = (group, itemNumber) => {
  const baseValue = normalizeTextValue(itemNumber).trim();
  if (!baseValue) return "";

  const prefix = normalizeTextValue(group?.itemNumberPrefix);
  const suffix = normalizeTextValue(group?.itemNumberSuffix);
  return `${prefix}${baseValue}${suffix}`;
};

const findAdjustmentAmount = (item) =>
  item.others.find((other) => other.type === "amount" && other.isAdjustment === true) ?? null;

const getAppliedAdjustmentValue = (item) => {
  const adjustment = findAdjustmentAmount(item);
  if (!adjustment || adjustment.isActive === false) {
    return 0;
  }

  return parseFloat(adjustment.value) || 0;
};

const hasActiveAdjustment = (item) => Math.abs(getAppliedAdjustmentValue(item)) > 0.01;

const syncItemFinalTotal = (item, desiredTotal, adjustmentName = "Adjustment") => {
  const parsedDesiredTotal = parseFloat(desiredTotal);
  if (Number.isNaN(parsedDesiredTotal)) {
    return item;
  }

  const existingAdjustment = findAdjustmentAmount(item);
  const currentAdjustmentValue = getAppliedAdjustmentValue(item);
  const baseWithoutAdjustment = calculateItemTotals(item).calculatedTotal - currentAdjustmentValue;
  const nextAdjustmentValue = roundToTwo(parsedDesiredTotal - baseWithoutAdjustment);

  if (Math.abs(nextAdjustmentValue) <= 0.01) {
    if (!existingAdjustment) {
      return item;
    }

    return {
      ...item,
      others: item.others.filter((other) => other.id !== existingAdjustment.id),
    };
  }

  const resolvedName = adjustmentName.trim() || existingAdjustment?.name || "Adjustment";

  if (existingAdjustment) {
    return {
      ...item,
      others: item.others.map((other) =>
        other.id === existingAdjustment.id
          ? {
              ...other,
              type: "amount",
              name: resolvedName,
              value: nextAdjustmentValue.toString(),
              isActive: true,
              isAdjustment: true,
            }
          : other,
      ),
    };
  }

  return {
    ...item,
    others: [...item.others, createAdjustmentAmount(resolvedName, nextAdjustmentValue.toString())],
  };
};

const normalizeStoredOther = (other) => {
  if (!other || typeof other !== "object") {
    return null;
  }

  if (other.type === "amount") {
    return {
      id: typeof other.id === "string" ? other.id : generateId(),
      type: "amount",
      name: normalizeTextValue(other.name),
      value: normalizeTextValue(other.value),
      isActive: other.isActive !== false,
      isAdjustment: other.isAdjustment === true,
    };
  }

  if (other.type === "discount") {
    return {
      id: typeof other.id === "string" ? other.id : generateId(),
      type: "discount",
      name: normalizeTextValue(other.name),
      percent: normalizeTextValue(other.percent),
      targets: Array.isArray(other.targets) ? [...other.targets] : [],
      rounding: other.rounding === "round_first" ? "round_first" : "sum_first",
      isActive: other.isActive !== false,
    };
  }

  if (other.type === "info") {
    return {
      id: typeof other.id === "string" ? other.id : generateId(),
      type: "info",
      name: normalizeTextValue(other.name),
      value: normalizeTextValue(other.value),
      isActive: other.isActive !== false,
    };
  }

  return null;
};

const normalizeStoredItem = (item) => {
  const normalizedItem = {
    id: typeof item?.id === "string" ? item.id : generateId(),
    itemNumber: normalizeTextValue(item?.itemNumber),
    itemName: normalizeTextValue(item?.itemName),
    description: normalizeTextValue(item?.description),
    uom: normalizeTextValue(item?.uom),
    material: normalizeTextValue(item?.material),
    labor: normalizeTextValue(item?.labor),
    equipment: normalizeTextValue(item?.equipment),
    others: Array.isArray(item?.others)
      ? item.others.map(normalizeStoredOther).filter(Boolean)
      : [],
    pricingStatus:
      typeof item?.pricingStatus === "string" && PRICING_STATUS_LABELS[item.pricingStatus]
        ? item.pricingStatus
        : "priced",
  };

  if (item?.overrideTotalFlag === true) {
    return syncItemFinalTotal(
      normalizedItem,
      normalizeTextValue(item.overrideTotalValue),
      "Adjustment",
    );
  }

  return normalizedItem;
};

const normalizeStoredGroup = (group) => ({
  id: typeof group?.id === "string" ? group.id : generateId(),
  name: normalizeTextValue(group?.name) || "Untitled Group",
  itemNumberPrefix: normalizeTextValue(group?.itemNumberPrefix),
  itemNumberSuffix: normalizeTextValue(group?.itemNumberSuffix),
  items: Array.isArray(group?.items) ? group.items.map(normalizeStoredItem) : [],
});

const normalizeStoredBook = (book) => ({
  id: typeof book?.id === "string" ? book.id : generateId(),
  name: normalizeTextValue(book?.name) || "Untitled Book",
  groups: Array.isArray(book?.groups) ? book.groups.map(normalizeStoredGroup) : [],
});

const getItemFinalTotal = (item) => calculateItemTotals(item).calculatedTotal;

const formatCurrency = (value) => `$${(value || 0).toFixed(2)}`;

const parseCurrencyLikeValue = (value) => {
  const parsedValue = parseFloat(value);
  return Number.isNaN(parsedValue) ? null : parsedValue;
};

const formatOptionalCurrency = (value) => {
  const parsedValue = parseCurrencyLikeValue(value);
  return parsedValue === null ? "--" : formatCurrency(parsedValue);
};

export const getBookItemCount = (book) =>
  (Array.isArray(book?.groups) ? book.groups : []).reduce(
    (total, group) => total + (Array.isArray(group?.items) ? group.items.length : 0),
    0,
  );

const getActiveOtherEntries = (item, type) =>
  item.others.filter((other) => other.type === type && other.isActive !== false);

const getOtherSummary = (item, type) => {
  const entries = getActiveOtherEntries(item, type);

  if (entries.length === 0) {
    return "--";
  }

  if (type === "amount") {
    return entries
      .map((entry) => `${entry.name || "Amount"} ${formatOptionalCurrency(entry.value)}`)
      .join(" · ");
  }

  if (type === "discount") {
    return entries
      .map((entry) => `${entry.name || "Discount"} ${entry.percent || 0}%`)
      .join(" · ");
  }

  return entries
    .map((entry) => {
      if (!entry.value) return entry.name || "Info";
      return `${entry.name || "Info"}: ${entry.value}`;
    })
    .join(" · ");
};

const parsePercentLikeValue = (value) => {
  const parsedValue = parseFloat(value);
  return Number.isNaN(parsedValue) ? null : parsedValue;
};

const roundCurrencyValue = (value) => roundToTwo(value || 0);

const formatContractCurrencyValue = (value) => roundCurrencyValue(value).toFixed(2);

const getPositiveContractPricingTargets = (item) => {
  const targets = [];
  const baseTargets = [
    { id: "material", value: parseFloat(item.material) || 0 },
    { id: "labor", value: parseFloat(item.labor) || 0 },
    { id: "equipment", value: parseFloat(item.equipment) || 0 },
  ];

  baseTargets.forEach((target) => {
    if (target.value > 0.0001) {
      targets.push(target.id);
    }
  });

  getActiveOtherEntries(item, "amount").forEach((amount) => {
    const value = parseFloat(amount.value) || 0;
    if (value > 0.0001) {
      targets.push(amount.id);
    }
  });

  return targets;
};

const getUniformContractDiscountPercent = (item) => {
  const activeDiscounts = getActiveOtherEntries(item, "discount");
  if (activeDiscounts.length === 0) {
    return null;
  }

  const uniquePercents = new Set();
  activeDiscounts.forEach((discount) => {
    const percent = parsePercentLikeValue(discount.percent);
    if (percent !== null && Math.abs(percent) > 0.0001) {
      uniquePercents.add(percent.toFixed(6));
    }
  });

  if (uniquePercents.size !== 1) {
    return null;
  }

  const positiveTargets = getPositiveContractPricingTargets(item);
  if (positiveTargets.length === 0) {
    return null;
  }

  const coveredTargets = new Set();
  activeDiscounts.forEach((discount) => {
    discount.targets.forEach((targetId) => {
      coveredTargets.add(targetId);
    });
  });

  const coversAllPositiveTargets = positiveTargets.every((targetId) => coveredTargets.has(targetId));
  if (!coversAllPositiveTargets) {
    return null;
  }

  return parseFloat([...uniquePercents][0]);
};

const getEstimatorItemPricingMetrics = (item) => {
  const totals = calculateItemTotals(item);
  const preDiscountTotal = totals.baseTotal + totals.otherAmountsTotal;
  const finalTotal = totals.calculatedTotal;
  const hasEstimatorDiscount =
    getActiveOtherEntries(item, "discount").length > 0 && totals.discountsTotal > 0.01;
  const uniformContractDiscountPercent = getUniformContractDiscountPercent(item);
  const canRepresentAsContractDiscount =
    hasEstimatorDiscount &&
    uniformContractDiscountPercent !== null &&
    preDiscountTotal > 0.01 &&
    finalTotal >= 0;
  const effectiveDiscountPercent = canRepresentAsContractDiscount
    ? ((preDiscountTotal - finalTotal) / preDiscountTotal) * 100
    : 0;

  return {
    ...totals,
    preDiscountTotal,
    finalTotal,
    hasEstimatorDiscount,
    canRepresentAsContractDiscount,
    effectiveDiscountPercent,
    uniformContractDiscountPercent,
  };
};

const estimatorItemHasContractData = (group, item) => {
  const textFields = [
    getGroupItemNumber(group, item.itemNumber),
    item.itemName,
    item.description,
    item.uom,
  ];

  if (textFields.some((value) => normalizeTextValue(value).trim())) {
    return true;
  }

  if (Math.abs(getItemFinalTotal(item)) > 0.01) {
    return true;
  }

  if ((item.others || []).some((other) => other.isActive !== false)) {
    return true;
  }

  return item.pricingStatus !== "priced";
};

const toContractPercentValue = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number.parseFloat(value.toFixed(2));
};

const getIncludedEstimatorGroupsForPart1Import = (book, groupIds) => {
  if (!Array.isArray(groupIds)) {
    return book.groups;
  }

  const selectedGroupIds = new Set(groupIds);
  return book.groups.filter((group) => selectedGroupIds.has(group.id));
};

export const summarizeEstimatorBookForPart1Import = (storedBook, options = {}) => {
  const book = normalizeStoredBook(storedBook);
  const includedGroups = getIncludedEstimatorGroupsForPart1Import(book, options?.groupIds);
  const summary = {
    itemCount: 0,
    discountedItemCount: 0,
    convertibleDiscountItemCount: 0,
    fallbackDiscountItemCount: 0,
  };

  includedGroups.forEach((group) => {
    group.items.forEach((item) => {
      if (!estimatorItemHasContractData(group, item)) {
        return;
      }

      summary.itemCount += 1;

      const pricingMetrics = getEstimatorItemPricingMetrics(item);
      if (!pricingMetrics.hasEstimatorDiscount) {
        return;
      }

      summary.discountedItemCount += 1;

      if (pricingMetrics.canRepresentAsContractDiscount) {
        summary.convertibleDiscountItemCount += 1;
      } else {
        summary.fallbackDiscountItemCount += 1;
      }
    });
  });

  return summary;
};

export const buildPart1RowsFromEstimatorBook = (storedBook, vendorName = "", options = {}) => {
  const book = normalizeStoredBook(storedBook);
  const manufacturer = normalizeTextValue(vendorName).trim();
  const pricingMode =
    options?.pricingMode === "contract_discount" ? "contract_discount" : "final_price";
  const includedGroups = getIncludedEstimatorGroupsForPart1Import(book, options?.groupIds);
  const rows = [];

  includedGroups.forEach((group) => {
    group.items.forEach((item) => {
      if (!estimatorItemHasContractData(group, item)) {
        return;
      }

      const productNumber = getGroupItemNumber(group, item.itemNumber);
      const groupName = normalizeTextValue(group.name).trim();
      const pricingStatusLabel = PRICING_STATUS_LABELS[item.pricingStatus] || "Priced";
      const amountSummary = getOtherSummary(item, "amount");
      const discountSummary = getOtherSummary(item, "discount");
      const infoSummary = getOtherSummary(item, "info");
      const pricingMetrics = getEstimatorItemPricingMetrics(item);
      const shouldImportEstimatorDiscount =
        pricingMode === "contract_discount" &&
        item.pricingStatus === "priced" &&
        pricingMetrics.canRepresentAsContractDiscount;
      const descriptionParts = [];
      let msrpValue =
        item.pricingStatus === "priced"
          ? roundToTwo(pricingMetrics.finalTotal).toFixed(2)
          : pricingStatusLabel;
      let discountValue = 0;

      if (normalizeTextValue(item.description).trim()) {
        descriptionParts.push(normalizeTextValue(item.description).trim());
      }

      if (groupName) {
        descriptionParts.push(`Estimator group: ${groupName}`);
      }

      if (item.pricingStatus !== "priced") {
        descriptionParts.push(`Pricing status: ${pricingStatusLabel}`);
      }

      if (shouldImportEstimatorDiscount) {
        const resolvedContractDiscountPercent =
          pricingMetrics.uniformContractDiscountPercent ?? pricingMetrics.effectiveDiscountPercent;
        discountValue = toContractPercentValue(resolvedContractDiscountPercent);
        msrpValue = formatContractCurrencyValue(pricingMetrics.preDiscountTotal);
        descriptionParts.push("Estimator pricing imported as MSRP plus contract discount.");
      } else if (pricingMetrics.hasEstimatorDiscount) {
        descriptionParts.push("Estimator final total already includes discounts.");

        if (
          pricingMode === "contract_discount" &&
          !pricingMetrics.canRepresentAsContractDiscount &&
          item.pricingStatus === "priced"
        ) {
          descriptionParts.push(
            "Estimator discounts could not be converted into a single contract discount, so the final price was imported with 0% contract discount.",
          );
        }
      }

      if (amountSummary !== "--") {
        descriptionParts.push(`Additional amounts: ${amountSummary}`);
      }

      if (discountSummary !== "--") {
        descriptionParts.push(`Estimator discounts: ${discountSummary}`);
      }

      if (infoSummary !== "--") {
        descriptionParts.push(`Notes: ${infoSummary}`);
      }

      rows.push({
        id: generateId(),
        manufacturer: manufacturer || "",
        website: "",
        productName: normalizeTextValue(item.itemName).trim() || groupName || "Estimator Item",
        productNumber,
        description: descriptionParts.join(" | "),
        units: normalizeTextValue(item.uom).trim(),
        msrp: msrpValue,
        discount: discountValue,
      });
    });
  });

  return rows;
};

const itemMatchesSearch = (group, item, query) => {
  const detailText = item.others
    .map((other) => `${other.name || ""} ${other.value || ""} ${other.percent || ""}`)
    .join(" ");

  const searchableText = [
    getGroupItemNumber(group, item.itemNumber),
    item.itemNumber,
    item.itemName,
    item.description,
    item.uom,
    PRICING_STATUS_LABELS[item.pricingStatus] || "",
    detailText,
  ]
    .join(" ")
    .toLowerCase();

  return searchableText.includes(query);
};

export default function EstimatorPage({ onBack }) {
  const [books, setBooks] = useState(() =>
    normalizeStoredBooks(readJsonStorage(ESTIMATOR_BOOKS_STORAGE_KEY, [])),
  );
  const [activeBookId, setActiveBookId] = useState(() =>
    readJsonStorage(ESTIMATOR_ACTIVE_BOOK_STORAGE_KEY, null),
  );
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [showCreateBook, setShowCreateBook] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [renameBookTarget, setRenameBookTarget] = useState(null);
  const [renameGroupTarget, setRenameGroupTarget] = useState(null);
  const [groupSettingsTarget, setGroupSettingsTarget] = useState(null);
  const [showColumnControls, setShowColumnControls] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [importTarget, setImportTarget] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedItemKey, setExpandedItemKey] = useState(null);
  const [tableColumns, setTableColumns] = useState(() =>
    normalizeStoredTableColumns(readJsonStorage(ESTIMATOR_COLUMNS_STORAGE_KEY, null)),
  );
  const groupRefs = useRef({});
  const resizeCleanupRef = useRef(null);

  useEffect(
    () => () => {
      resizeCleanupRef.current?.();
    },
    [],
  );

  useEffect(() => {
    writeJsonStorage(ESTIMATOR_BOOKS_STORAGE_KEY, books);
  }, [books]);

  useEffect(() => {
    writeJsonStorage(ESTIMATOR_ACTIVE_BOOK_STORAGE_KEY, activeBookId);
  }, [activeBookId]);

  useEffect(() => {
    writeJsonStorage(ESTIMATOR_COLUMNS_STORAGE_KEY, tableColumns);
  }, [tableColumns]);

  useEffect(() => {
    if (books.length === 0) {
      if (activeBookId !== null) {
        setActiveBookId(null);
      }
      return;
    }

    if (!books.some((book) => book.id === activeBookId)) {
      setActiveBookId(books[0].id);
    }
  }, [books, activeBookId]);

  const activeBook = useMemo(
    () => books.find((book) => book.id === activeBookId) ?? null,
    [books, activeBookId],
  );

  useEffect(() => {
    if (!activeBook || activeBook.groups.length === 0) {
      if (activeGroupId !== null) {
        setActiveGroupId(null);
      }
      return;
    }

    if (!activeBook.groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(activeBook.groups[0].id);
    }
  }, [activeBook, activeGroupId]);

  const visibleGroups = useMemo(() => {
    if (!activeBook) return [];

    const query = searchTerm.trim().toLowerCase();

    return activeBook.groups
      .map((group) => {
        const filteredItems = query
          ? group.items.filter((item) => itemMatchesSearch(group, item, query))
          : group.items;

        return {
          ...group,
          filteredItems,
          matchesGroupName: query ? group.name.toLowerCase().includes(query) : true,
        };
      })
      .filter((group) => {
        if (!query) return true;
        return group.matchesGroupName || group.filteredItems.length > 0;
      });
  }, [activeBook, searchTerm]);

  const visibleItemCount = visibleGroups.reduce(
    (total, group) => total + group.filteredItems.length,
    0,
  );
  const visibleDataColumnCount = tableColumns.filter((column) => column.visible).length;
  const totalItemCount = activeBook ? getBookItemCount(activeBook) : 0;
  const sidebarGroups = searchTerm.trim() ? visibleGroups : activeBook?.groups ?? [];
  const importGroup =
    activeBook?.groups.find((group) => group.id === importTarget?.groupId) ?? null;
  const expandedItemContext = useMemo(() => {
    if (!activeBook || !expandedItemKey) return null;

    const separatorIndex = expandedItemKey.indexOf(":");
    if (separatorIndex === -1) return null;

    const groupId = expandedItemKey.slice(0, separatorIndex);
    const itemId = expandedItemKey.slice(separatorIndex + 1);
    const group = activeBook.groups.find((currentGroup) => currentGroup.id === groupId);
    const item = group?.items.find((currentItem) => currentItem.id === itemId);

    if (!group || !item) return null;

    return { group, item };
  }, [activeBook, expandedItemKey]);

  const registerGroupRef = (groupId, node) => {
    if (node) {
      groupRefs.current[groupId] = node;
    } else {
      delete groupRefs.current[groupId];
    }
  };

  const scrollToGroup = (groupId) => {
    setActiveGroupId(groupId);
    groupRefs.current[groupId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const updateActiveBookGroups = (updater) => {
    setBooks((currentBooks) =>
      currentBooks.map((book) =>
        book.id === activeBookId ? { ...book, groups: updater(book.groups) } : book,
      ),
    );
  };

  const updateGroup = (groupId, updater) => {
    updateActiveBookGroups((groups) =>
      groups.map((group) => (group.id === groupId ? updater(group) : group)),
    );
  };

  const handleCreateBook = (name) => {
    const nextBook = createCustomBook(name.trim());

    setBooks((currentBooks) => [...currentBooks, nextBook]);
    setActiveBookId(nextBook.id);
    setActiveGroupId(null);
    setSearchTerm("");
    setExpandedItemKey(null);
    setShowCreateBook(false);
  };

  const handleCreateGroup = (name) => {
    if (!activeBook) return;

    const nextGroup = createCustomGroup(name.trim());

    setBooks((currentBooks) =>
      currentBooks.map((book) =>
        book.id === activeBook.id ? { ...book, groups: [...book.groups, nextGroup] } : book,
      ),
    );
    setActiveGroupId(nextGroup.id);
    setExpandedItemKey(null);
    setShowCreateGroup(false);

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        groupRefs.current[nextGroup.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const requestRenameBook = (bookId) => {
    const book = books.find((currentBook) => currentBook.id === bookId);
    if (!book) return;

    setRenameBookTarget({ id: book.id, name: book.name });
  };

  const requestRenameGroup = (groupId) => {
    const group = activeBook?.groups.find((currentGroup) => currentGroup.id === groupId);
    if (!group || !activeBook) return;

    setRenameGroupTarget({
      id: group.id,
      bookId: activeBook.id,
      name: group.name,
    });
  };

  const handleRenameBook = (name) => {
    if (!renameBookTarget) return;

    setBooks((currentBooks) =>
      currentBooks.map((book) =>
        book.id === renameBookTarget.id ? { ...book, name: name.trim() } : book,
      ),
    );
    setRenameBookTarget(null);
  };

  const handleRenameGroup = (name) => {
    if (!renameGroupTarget) return;

    setBooks((currentBooks) =>
      currentBooks.map((book) =>
        book.id === renameGroupTarget.bookId
          ? {
              ...book,
              groups: book.groups.map((group) =>
                group.id === renameGroupTarget.id ? { ...group, name: name.trim() } : group,
              ),
            }
          : book,
      ),
    );
    setRenameGroupTarget(null);
  };

  const requestGroupSettings = (groupId) => {
    const group = activeBook?.groups.find((currentGroup) => currentGroup.id === groupId);
    if (!group) return;

    setGroupSettingsTarget({
      id: group.id,
      name: group.name,
      itemNumberPrefix: group.itemNumberPrefix || "",
      itemNumberSuffix: group.itemNumberSuffix || "",
    });
  };

  const handleSaveGroupSettings = ({ itemNumberPrefix, itemNumberSuffix }) => {
    if (!groupSettingsTarget) return;

    updateGroup(groupSettingsTarget.id, (group) => ({
      ...group,
      itemNumberPrefix,
      itemNumberSuffix,
    }));
    setGroupSettingsTarget(null);
  };

  const requestDeleteBook = (bookId) => {
    const book = books.find((currentBook) => currentBook.id === bookId);
    if (!book) return;

    setConfirmDelete({
      type: "book",
      id: bookId,
      title: `Delete "${book.name}"?`,
      description: `This will remove ${book.groups.length} groups and ${getBookItemCount(
        book,
      )} items from your locally cached estimator data.`,
      confirmLabel: "Delete Book",
    });
  };

  const requestDeleteGroup = (groupId) => {
    const group = activeBook?.groups.find((currentGroup) => currentGroup.id === groupId);
    if (!group) return;

    setConfirmDelete({
      type: "group",
      id: groupId,
      title: `Delete "${group.name}"?`,
      description: `This will remove ${group.items.length} items from this book and delete the group from your local cache.`,
      confirmLabel: "Delete Group",
    });
  };

  const handleConfirmDelete = () => {
    if (!confirmDelete) return;

    if (confirmDelete.type === "book") {
      setBooks((currentBooks) => currentBooks.filter((book) => book.id !== confirmDelete.id));

      if (activeBookId === confirmDelete.id) {
        setActiveGroupId(null);
        setExpandedItemKey(null);
        setImportTarget(null);
      }
    }

    if (confirmDelete.type === "group") {
      updateActiveBookGroups((groups) => groups.filter((group) => group.id !== confirmDelete.id));

      if (activeGroupId === confirmDelete.id) {
        setActiveGroupId(null);
      }
      if (expandedItemKey?.startsWith(`${confirmDelete.id}:`)) {
        setExpandedItemKey(null);
      }
      if (importTarget?.groupId === confirmDelete.id) {
        setImportTarget(null);
      }
    }

    setConfirmDelete(null);
  };

  const handleSelectBook = (bookId) => {
    setActiveBookId(bookId);
    setExpandedItemKey(null);
    setSearchTerm("");
  };

  const handleAddItemToGroup = (groupId) => {
    const currentGroup = activeBook?.groups.find((group) => group.id === groupId);
    if (!currentGroup) return;

    const newItem = createEmptyEstimatorItem(`ITEM-${currentGroup.items.length + 1}`);

    updateGroup(groupId, (group) => ({
      ...group,
      items: [...group.items, newItem],
    }));

    setActiveGroupId(groupId);
    setExpandedItemKey(`${groupId}:${newItem.id}`);

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        groupRefs.current[groupId]?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const handleUpdateItem = (groupId, itemId, field, value) => {
    updateGroup(groupId, (group) => ({
      ...group,
      items: group.items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
    }));
  };

  const handleRemoveItem = (groupId, itemId) => {
    updateGroup(groupId, (group) => ({
      ...group,
      items: group.items.filter((item) => item.id !== itemId),
    }));
    setExpandedItemKey((currentKey) => (currentKey === `${groupId}:${itemId}` ? null : currentKey));
  };

  const handleOpenImport = (groupId) => {
    setActiveGroupId(groupId);
    setImportTarget({ groupId });
  };

  const handleImportItems = ({ items: importedItems, itemNumberPrefix, itemNumberSuffix }) => {
    if (!importTarget?.groupId) return;

    const { groupId } = importTarget;

    updateGroup(groupId, (group) => ({
      ...group,
      itemNumberPrefix:
        typeof itemNumberPrefix === "string" ? itemNumberPrefix : group.itemNumberPrefix || "",
      itemNumberSuffix:
        typeof itemNumberSuffix === "string" ? itemNumberSuffix : group.itemNumberSuffix || "",
      items: [...group.items, ...importedItems],
    }));

    setImportTarget(null);
    setActiveGroupId(groupId);
    setExpandedItemKey(null);

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        groupRefs.current[groupId]?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const toggleColumnVisibility = (columnId) => {
    setTableColumns((currentColumns) =>
      currentColumns.map((column) =>
        column.id === columnId ? { ...column, visible: !column.visible } : column,
      ),
    );
  };

  const moveColumn = (columnId, direction) => {
    setTableColumns((currentColumns) => {
      const currentIndex = currentColumns.findIndex((column) => column.id === columnId);
      const nextIndex = currentIndex + direction;

      if (currentIndex === -1 || nextIndex < 0 || nextIndex >= currentColumns.length) {
        return currentColumns;
      }

      const nextColumns = [...currentColumns];
      [nextColumns[currentIndex], nextColumns[nextIndex]] = [
        nextColumns[nextIndex],
        nextColumns[currentIndex],
      ];
      return nextColumns;
    });
  };

  const resizeColumn = (columnId, width) => {
    setTableColumns((currentColumns) =>
      currentColumns.map((column) =>
        column.id === columnId ? { ...column, width } : column,
      ),
    );
  };

  const startResizeColumn = (columnId, event) => {
    event.preventDefault();
    event.stopPropagation();

    resizeCleanupRef.current?.();

    const column = tableColumns.find((currentColumn) => currentColumn.id === columnId);
    if (!column || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const startX = event.clientX;
    const startWidth = column.width;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      resizeColumn(columnId, Math.max(MIN_TABLE_COLUMN_WIDTH, startWidth + delta));
    };

    const cleanup = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;

      if (resizeCleanupRef.current === cleanup) {
        resizeCleanupRef.current = null;
      }
    };

    const handleUp = () => {
      cleanup();
    };

    resizeCleanupRef.current = cleanup;
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const resetTableColumns = () => {
    setTableColumns(createDefaultTableColumns());
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans text-slate-800 md:p-8 lg:h-screen lg:overflow-hidden">
      <div className="mx-auto max-w-[min(98vw,1880px)] space-y-6 lg:flex lg:h-full lg:flex-col lg:space-y-6">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center lg:shrink-0">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-900">
              <Calculator className="h-8 w-8 text-blue-600" />
              Flexible Estimator
            </h1>
            <p className="mt-1 text-slate-500">
              Build custom books, organize them into groups, and manage imported or manual items in one
              searchable workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                <ArrowLeft className="h-5 w-5" />
                Back
              </button>
            )}
            <button
              onClick={() => setShowCreateBook(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Plus className="h-5 w-5" />
              Create Custom Book
            </button>
          </div>
        </header>

        {books.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center shadow-sm">
            <Calculator className="mx-auto mb-4 h-14 w-14 text-slate-300" />
            <h2 className="text-2xl font-semibold text-slate-900">Start with a custom book</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Create a book first, then add custom groups inside it. Each group becomes its own working area
              for imports and manual line items, and the full book stays visible in one grouped view.
            </p>
            <button
              onClick={() => setShowCreateBook(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Plus className="h-5 w-5" />
              Create Custom Book
            </button>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:shrink-0">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Custom Books
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                      {activeBook?.name || "Select a book"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Books hold your group structure. Groups hold the imports and new items.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {books.map((book) => {
                      const isActive = book.id === activeBookId;

                      return (
                        <button
                          key={book.id}
                          onClick={() => handleSelectBook(book.id)}
                          className={`rounded-xl border px-4 py-3 text-left transition-all ${
                            isActive
                              ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                          }`}
                        >
                          <div className="font-semibold">{book.name}</div>
                          <div className={`mt-1 text-xs ${isActive ? "text-blue-100" : "text-slate-500"}`}>
                            {book.groups.length} groups · {getBookItemCount(book)} items
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activeBook && (
                  <div className="grid grid-cols-3 gap-3 sm:min-w-[360px]">
                    <SummaryMetric label="Groups" value={activeBook.groups.length} />
                    <SummaryMetric label="Items" value={totalItemCount} />
                    <SummaryMetric label="Shown" value={visibleItemCount} />
                  </div>
                )}
              </div>
            </section>

            {activeBook && (
              <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[300px,minmax(0,1fr)]">
                <aside className="lg:min-h-0">
                  <div className="space-y-4 lg:flex lg:h-full lg:flex-col">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Working Book
                        </p>
                        <h3 className="mt-1 text-xl font-semibold text-slate-900">{activeBook.name}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          Add groups first, then build each group with imported rows or manual items. Changes
                          are saved locally in this browser.
                        </p>
                      </div>

                      <div className="mt-5 space-y-3">
                        <button
                          onClick={() => setShowCreateGroup(true)}
                          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
                        >
                          <Plus className="h-5 w-5" />
                          Add Group
                        </button>
                        <button
                          onClick={() => requestRenameBook(activeBook.id)}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-100"
                        >
                          <Edit3 className="h-4 w-4" />
                          Rename Book
                        </button>
                        <button
                          onClick={() => requestDeleteBook(activeBook.id)}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 font-medium text-red-700 transition-colors hover:bg-red-100"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete Book
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:min-h-0 lg:flex lg:flex-col">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Groups
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Click a group to jump directly to that section.
                          </p>
                        </div>
                      </div>

                      {activeBook.groups.length === 0 ? (
                        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                          No groups yet. Add the first group to start building this book.
                        </div>
                      ) : sidebarGroups.length === 0 ? (
                        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                          No groups match the current search.
                        </div>
                      ) : (
                        <div className="mt-4 space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                          {sidebarGroups.map((group) => {
                            const isActive = group.id === activeGroupId;
                            const countLabel = searchTerm.trim()
                              ? `${group.filteredItems.length}/${group.items.length} shown`
                              : `${group.items.length} items`;

                            return (
                              <div key={group.id} className="flex items-stretch gap-2">
                                <button
                                  onClick={() => scrollToGroup(group.id)}
                                  className={`flex min-w-0 flex-1 items-center justify-between rounded-xl border px-3 py-3 text-left transition-all ${
                                    isActive
                                      ? "border-blue-600 bg-blue-50 text-blue-900"
                                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                                  }`}
                                >
                                  <span className="min-w-0 pr-3 font-medium">{group.name}</span>
                                  <span
                                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                                      isActive ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                                    }`}
                                  >
                                    {countLabel}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => requestRenameGroup(group.id)}
                                  className="rounded-xl border border-slate-200 bg-white px-3 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                  title={`Rename ${group.name}`}
                                >
                                  <Edit3 className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => requestDeleteGroup(group.id)}
                                  className="rounded-xl border border-red-200 bg-red-50 px-3 text-red-600 transition-colors hover:bg-red-100 hover:text-red-700"
                                  title={`Delete ${group.name}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </aside>

                <main className="space-y-6 lg:min-h-0 lg:flex lg:flex-col">
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:shrink-0">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          View Whole Book
                        </p>
                        <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                          Groups on the left, all items on the right
                        </h2>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                          Search across the full book, keep the grouped structure visible, and jump directly
                          into the section you want to review or edit.
                        </p>
                      </div>

                      <div className="w-full max-w-2xl">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Search Items
                        </label>
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Search item #, name, description, UOM, status, or extra labels"
                            className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => setShowColumnControls((currentValue) => !currentValue)}
                          className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                        >
                          <Settings2 className="h-4 w-4" />
                          {showColumnControls ? "Hide Column Controls" : "Show Column Controls"}
                        </button>
                        <button
                          onClick={resetTableColumns}
                          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800"
                        >
                          Reset Layout
                        </button>
                      </div>
                      <p className="text-sm text-slate-500">
                        {visibleDataColumnCount} of {tableColumns.length} data columns visible. Reorder and
                        resize them below.
                      </p>
                    </div>

                    {showColumnControls && (
                      <ColumnLayoutPanel
                        columns={tableColumns}
                        onMoveColumn={moveColumn}
                        onToggleColumn={toggleColumnVisibility}
                      />
                    )}
                  </section>

                  <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
                    {activeBook.groups.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
                        <p className="text-lg font-medium text-slate-900">This book does not have any groups yet.</p>
                        <p className="mt-2 text-sm text-slate-500">
                          Add a group to create a place for imports and manual items.
                        </p>
                        <button
                          onClick={() => setShowCreateGroup(true)}
                          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
                        >
                          <Plus className="h-5 w-5" />
                          Add Group
                        </button>
                      </div>
                    ) : visibleGroups.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
                        <p className="text-lg font-medium text-slate-900">No items match the current search.</p>
                        <p className="mt-2 text-sm text-slate-500">
                          Try a different term or clear the search to see the whole book again.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {visibleGroups.map((group) => (
                          <GroupSection
                            key={group.id}
                            group={group}
                            isActive={group.id === activeGroupId}
                            expandedItemKey={expandedItemKey}
                            onAddItem={handleAddItemToGroup}
                            onEditItem={(itemId) => {
                              const nextKey = `${group.id}:${itemId}`;
                              setActiveGroupId(group.id);
                              setExpandedItemKey((currentKey) => (currentKey === nextKey ? null : nextKey));
                            }}
                            onImport={handleOpenImport}
                            onRemoveItem={handleRemoveItem}
                            onRequestGroupSettings={requestGroupSettings}
                            onRequestRenameGroup={requestRenameGroup}
                            onRequestDeleteGroup={requestDeleteGroup}
                            onSelectGroup={scrollToGroup}
                            registerSectionRef={registerGroupRef}
                            searchTerm={searchTerm}
                            onStartResizeColumn={startResizeColumn}
                            tableColumns={tableColumns}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </main>
              </div>
            )}
          </>
        )}

        {showCreateBook && (
          <NameModal
            confirmLabel="Create Book"
            description="Name the custom book you want to build. Groups and items will live inside this book."
            onClose={() => setShowCreateBook(false)}
            onSubmit={handleCreateBook}
            placeholder="Book name"
            title="Create Custom Book"
          />
        )}

        {renameBookTarget && (
          <NameModal
            confirmLabel="Save Name"
            description="Update the name of this custom book."
            initialValue={renameBookTarget.name}
            onClose={() => setRenameBookTarget(null)}
            onSubmit={handleRenameBook}
            placeholder="Book name"
            title="Rename Book"
          />
        )}

        {showCreateGroup && (
          <NameModal
            confirmLabel="Add Group"
            description="Give this group a name so you can import rows or add items into it."
            onClose={() => setShowCreateGroup(false)}
            onSubmit={handleCreateGroup}
            placeholder="Group name"
            title="Add Group"
          />
        )}

        {renameGroupTarget && (
          <NameModal
            confirmLabel="Save Name"
            description="Update the name of this group."
            initialValue={renameGroupTarget.name}
            onClose={() => setRenameGroupTarget(null)}
            onSubmit={handleRenameGroup}
            placeholder="Group name"
            title="Rename Group"
          />
        )}

        {groupSettingsTarget && (
          <GroupNumberFormatModal
            group={groupSettingsTarget}
            onClose={() => setGroupSettingsTarget(null)}
            onSubmit={handleSaveGroupSettings}
          />
        )}

        {importTarget && (
          <ImportModal
            existingItemCount={importGroup?.items.length ?? 0}
            group={importGroup}
            onClose={() => setImportTarget(null)}
            onImport={handleImportItems}
          />
        )}

        {expandedItemContext && (
          <ItemEditorModal
            group={expandedItemContext.group}
            groupName={expandedItemContext.group.name}
            item={expandedItemContext.item}
            onClose={() => setExpandedItemKey(null)}
            onRemoveItem={(itemId) => {
              handleRemoveItem(expandedItemContext.group.id, itemId);
              setExpandedItemKey(null);
            }}
            updateItem={(itemId, field, value) =>
              handleUpdateItem(expandedItemContext.group.id, itemId, field, value)
            }
          />
        )}

        {confirmDelete && (
          <ConfirmActionModal
            confirmLabel={confirmDelete.confirmLabel}
            description={confirmDelete.description}
            onClose={() => setConfirmDelete(null)}
            onConfirm={handleConfirmDelete}
            title={confirmDelete.title}
          />
        )}
      </div>
    </div>
  );
}

function SummaryMetric({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function ColumnLayoutPanel({ columns, onMoveColumn, onToggleColumn }) {
  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Table Columns
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Toggle any column, move it left or right here, then drag the header edges in the table to resize.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {columns.map((column, index) => (
          <div
            key={column.id}
            className={`rounded-xl border bg-white p-4 shadow-sm transition-colors ${
              column.visible ? "border-slate-200" : "border-slate-100"
            }`}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <label className="flex min-w-0 items-start gap-3">
                <input
                  type="checkbox"
                  checked={column.visible}
                  onChange={() => onToggleColumn(column.id)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">{column.label}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {column.width}px wide · position {index + 1}
                  </div>
                </div>
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onMoveColumn(column.id, -1)}
                  disabled={index === 0}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Move Left
                </button>
                <button
                  type="button"
                  onClick={() => onMoveColumn(column.id, 1)}
                  disabled={index === columns.length - 1}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Move Right
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupTableCell({ group, columnId, item, calculation }) {
  if (columnId === "itemNumber") {
    return (
      <span className="font-semibold text-slate-800">
        {getGroupItemNumber(group, item.itemNumber) || "Untitled"}
      </span>
    );
  }

  if (columnId === "itemName") {
    return <span className="font-medium text-slate-800">{item.itemName || "New item"}</span>;
  }

  if (columnId === "description") {
    return <span className="line-clamp-3 text-slate-500">{item.description || "No description yet"}</span>;
  }

  if (columnId === "uom") {
    return <span className="text-slate-500">{item.uom || "--"}</span>;
  }

  if (columnId === "pricingStatus") {
    return <PricingStatusBadge value={item.pricingStatus || "priced"} />;
  }

  if (columnId === "material") {
    return <span className="font-medium text-slate-700">{formatOptionalCurrency(item.material)}</span>;
  }

  if (columnId === "labor") {
    return <span className="font-medium text-slate-700">{formatOptionalCurrency(item.labor)}</span>;
  }

  if (columnId === "equipment") {
    return <span className="font-medium text-slate-700">{formatOptionalCurrency(item.equipment)}</span>;
  }

  if (columnId === "amounts") {
    return <span className="line-clamp-3 text-slate-600">{getOtherSummary(item, "amount")}</span>;
  }

  if (columnId === "discounts") {
    return <span className="line-clamp-3 text-slate-600">{getOtherSummary(item, "discount")}</span>;
  }

  if (columnId === "info") {
    return <span className="line-clamp-3 text-slate-600">{getOtherSummary(item, "info")}</span>;
  }

  if (columnId === "baseSubtotal") {
    return <span className="font-medium text-slate-700">{formatCurrency(calculation.baseTotal)}</span>;
  }

  if (columnId === "calculatedTotal") {
    return (
      <span className="font-medium text-slate-700">{formatCurrency(calculation.calculatedTotal)}</span>
    );
  }

  if (columnId === "totalMode") {
    const isAdjusted = hasActiveAdjustment(item);

    return (
      <span
        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
          isAdjusted
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-slate-100 text-slate-600"
        }`}
      >
        {isAdjusted ? "Adjusted" : "Calculated"}
      </span>
    );
  }

  if (columnId === "finalTotal") {
    return <span className="font-semibold text-slate-900">{formatCurrency(getItemFinalTotal(item))}</span>;
  }

  return <span className="text-slate-400">--</span>;
}

function GroupSection({
  group,
  isActive,
  expandedItemKey,
  onAddItem,
  onEditItem,
  onImport,
  onRemoveItem,
  onRequestGroupSettings,
  onRequestRenameGroup,
  onRequestDeleteGroup,
  onSelectGroup,
  registerSectionRef,
  searchTerm,
  onStartResizeColumn,
  tableColumns,
}) {
  const showEmptySearchState = searchTerm.trim() && group.filteredItems.length === 0;
  const visibleColumns = tableColumns.filter((column) => column.visible);

  return (
    <section
      ref={(node) => registerSectionRef(group.id, node)}
      className={`scroll-mt-6 rounded-2xl border bg-white shadow-sm transition-colors ${
        isActive ? "border-blue-300 ring-1 ring-blue-100" : "border-slate-200"
      }`}
    >
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSelectGroup(group.id)}
              className="text-left text-2xl font-semibold text-slate-900 transition-colors hover:text-blue-700"
            >
              {group.name}
            </button>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
              {group.items.length} items
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {searchTerm.trim()
              ? `${group.filteredItems.length} matching items shown in this group.`
              : "Import rows or add manual items directly into this group."}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => onImport(group.id)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <Upload className="h-4 w-4" />
            Import Data
          </button>
          <button
            onClick={() => onAddItem(group.id)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add New Item
          </button>
          <button
            onClick={() => onRequestGroupSettings(group.id)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Settings2 className="h-4 w-4" />
            Group Settings
          </button>
          <button
            onClick={() => onRequestRenameGroup(group.id)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Edit3 className="h-4 w-4" />
            Rename Group
          </button>
          <button
            onClick={() => onRequestDeleteGroup(group.id)}
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 font-medium text-red-700 transition-colors hover:bg-red-100"
          >
            <Trash2 className="h-4 w-4" />
            Delete Group
          </button>
        </div>
      </div>

      <div className="p-5">
        {group.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center">
            <p className="text-lg font-medium text-slate-900">This group is empty.</p>
            <p className="mt-2 text-sm text-slate-500">
              Use import data or add a new item to start building out this section.
            </p>
          </div>
        ) : showEmptySearchState ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center">
            <p className="text-lg font-medium text-slate-900">No items in this group match the search.</p>
            <p className="mt-2 text-sm text-slate-500">
              The group still matches by name, but none of its items matched the current term.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="overflow-x-auto">
                <table className="w-max min-w-full table-fixed text-left text-sm">
                  <colgroup>
                    {visibleColumns.map((column) => (
                      <col key={column.id} style={{ width: `${column.width}px` }} />
                    ))}
                    <col style={{ width: `${ACTIONS_COLUMN_WIDTH}px` }} />
                  </colgroup>
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      {visibleColumns.map((column) => (
                        <th
                          key={column.id}
                          className={`relative px-4 py-3 ${column.align === "right" ? "text-right" : "text-left"}`}
                        >
                          {column.label}
                          <button
                            type="button"
                            aria-label={`Resize ${column.label} column`}
                            onMouseDown={(event) => onStartResizeColumn(column.id, event)}
                            className="absolute inset-y-0 right-0 z-10 flex w-3 translate-x-1/2 cursor-col-resize items-stretch justify-center bg-transparent"
                          >
                            <span className="my-2 w-px rounded-full bg-slate-300 transition-colors hover:bg-blue-500" />
                          </button>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {group.filteredItems.map((item) => {
                      const rowKey = `${group.id}:${item.id}`;
                      const isExpanded = expandedItemKey === rowKey;
                      const calculation = calculateItemTotals(item);

                      return (
                        <React.Fragment key={item.id}>
                          <tr className={isExpanded ? "bg-blue-50/40" : "hover:bg-slate-50"}>
                            {visibleColumns.map((column) => (
                              <td
                                key={column.id}
                                className={`px-4 py-3 align-top ${
                                  column.align === "right" ? "text-right" : "text-left"
                                }`}
                              >
                                <GroupTableCell
                                  group={group}
                                  calculation={calculation}
                                  columnId={column.id}
                                  item={item}
                                />
                              </td>
                            ))}
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => onEditItem(item.id)}
                                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                    isExpanded
                                      ? "bg-blue-600 text-white hover:bg-blue-700"
                                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                  }`}
                                >
                                  {isExpanded ? "Close" : "Edit"}
                                </button>
                                <button
                                  onClick={() => onRemoveItem(group.id, item.id)}
                                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                  title="Delete Item"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PricingStatusBadge({ value }) {
  const styles = {
    priced: "border-emerald-200 bg-emerald-50 text-emerald-700",
    non_priced: "border-amber-200 bg-amber-50 text-amber-700",
    does_not_apply: "border-slate-200 bg-slate-100 text-slate-600",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        styles[value] || styles.priced
      }`}
    >
      {PRICING_STATUS_LABELS[value] || PRICING_STATUS_LABELS.priced}
    </span>
  );
}

function ItemEditorModal({ group, groupName, item, onClose, onRemoveItem, updateItem }) {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[92vh] w-[min(96vw,1200px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Editing Item
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              {getGroupItemNumber(group, item.itemNumber) || "Untitled"} · {item.itemName || "New item"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">Group: {groupName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-5">
          <div className="mx-auto max-w-6xl">
            <ItemCard
              group={group}
              item={item}
              removeItem={onRemoveItem}
              updateItem={updateItem}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmActionModal({ title, description, confirmLabel, onClose, onConfirm }) {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500">Confirm Delete</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-5 text-sm leading-6 text-slate-600">{description}</div>

        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function NameModal({
  title,
  description,
  placeholder,
  confirmLabel,
  initialValue = "",
  onClose,
  onSubmit,
}) {
  const [name, setName] = useState(initialValue);
  const trimmedName = name.trim();

  useEffect(() => {
    setName(initialValue);
  }, [initialValue]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!trimmedName) return;
            onSubmit(trimmedName);
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-5 py-5">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Name
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={placeholder}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!trimmedName}
              className="rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GroupNumberFormatModal({ group, onClose, onSubmit }) {
  const [itemNumberPrefix, setItemNumberPrefix] = useState(group?.itemNumberPrefix || "");
  const [itemNumberSuffix, setItemNumberSuffix] = useState(group?.itemNumberSuffix || "");

  useEffect(() => {
    setItemNumberPrefix(group?.itemNumberPrefix || "");
    setItemNumberSuffix(group?.itemNumberSuffix || "");
  }, [group]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const previewValue =
    getGroupItemNumber(
      { itemNumberPrefix, itemNumberSuffix },
      "12345",
    ) || "12345";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({
              itemNumberPrefix,
              itemNumberSuffix,
            });
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Group Item Number Format</h2>
              <p className="mt-1 text-sm text-slate-500">
                Update how item numbers render in {group?.name || "this group"}. Existing and new items
                will use these affixes automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4 px-5 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Prefix
                </label>
                <input
                  autoFocus
                  type="text"
                  value={itemNumberPrefix}
                  onChange={(event) => setItemNumberPrefix(event.target.value)}
                  placeholder="e.g. 110-"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Suffix
                </label>
                <input
                  type="text"
                  value={itemNumberSuffix}
                  onChange={(event) => setItemNumberSuffix(event.target.value)}
                  placeholder="e.g. -ALT"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Preview</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{previewValue}</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FinalTotalAdjustmentModal({ prompt, onClose, onConfirm }) {
  const [adjustmentName, setAdjustmentName] = useState(prompt?.adjustmentName || "Adjustment");

  useEffect(() => {
    setAdjustmentName(prompt?.adjustmentName || "Adjustment");
  }, [prompt]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const adjustmentAmount = roundToTwo(Math.abs(prompt?.nextAdjustmentValue || 0));
  const isRemovingAdjustment = adjustmentAmount <= 0.01;
  const isCreditAdjustment = (prompt?.nextAdjustmentValue || 0) < 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm(adjustmentName);
          }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
                Total Needs Reconciliation
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Apply Adjustment Amount</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4 px-5 py-5">
            <p className="text-sm leading-6 text-slate-600">
              This item currently totals {formatCurrency(prompt.currentTotal)}. To reach{" "}
              {formatCurrency(prompt.targetTotal)}, the estimator needs an amount entry so the math still
              balances.
            </p>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Result
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                {isRemovingAdjustment
                  ? "Remove the current adjustment"
                  : `${isCreditAdjustment ? "-" : "+"}${formatCurrency(adjustmentAmount)}`}
              </div>
            </div>

            {!isRemovingAdjustment && (
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Adjustment Name
                </label>
                <input
                  autoFocus
                  type="text"
                  value={adjustmentName}
                  onChange={(event) => setAdjustmentName(event.target.value)}
                  placeholder="Adjustment"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              {isRemovingAdjustment ? "Remove Adjustment" : "Apply Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ItemCard({ group, item, updateItem, removeItem }) {
  const calculation = useMemo(() => calculateItemTotals(item), [item]);
  const finalTotal = calculation.calculatedTotal;
  const adjustmentEntry = useMemo(() => findAdjustmentAmount(item), [item]);
  const [finalTotalInput, setFinalTotalInput] = useState(() => roundToTwo(finalTotal).toFixed(2));
  const [adjustmentPrompt, setAdjustmentPrompt] = useState(null);

  useEffect(() => {
    setFinalTotalInput(roundToTwo(finalTotal).toFixed(2));
  }, [finalTotal]);

  const addOther = (type) => {
    let newOther;

    if (type === "amount") {
      newOther = { id: generateId(), type: "amount", name: "New Amount", value: "", isActive: true };
    } else if (type === "discount") {
      newOther = {
        id: generateId(),
        type: "discount",
        name: "New Discount",
        percent: "",
        targets: [],
        rounding: "sum_first",
        isActive: true,
      };
    } else if (type === "info") {
      newOther = { id: generateId(), type: "info", name: "New Info", value: "", isActive: true };
    }

    updateItem(item.id, "others", [...item.others, newOther]);
  };

  const updateOther = (otherId, field, value) => {
    const updated = item.others.map((other) =>
      other.id === otherId ? { ...other, [field]: value } : other,
    );
    updateItem(item.id, "others", updated);
  };

  const removeOther = (otherId) => {
    const removedIsAmount = item.others.find((other) => other.id === otherId)?.type === "amount";
    let filtered = item.others.filter((other) => other.id !== otherId);

    if (removedIsAmount) {
      filtered = filtered.map((other) => {
        if (other.type === "discount" && other.targets.includes(otherId)) {
          return { ...other, targets: other.targets.filter((target) => target !== otherId) };
        }
        return other;
      });
    }

    updateItem(item.id, "others", filtered);
  };

  const otherAmounts = item.others.filter((other) => other.type === "amount");
  const availableTargets = [
    { id: "material", label: "Material" },
    { id: "labor", label: "Labor" },
    { id: "equipment", label: "Equipment" },
    ...otherAmounts.map((amount) => ({ id: amount.id, label: amount.name || "Unnamed Amount" })),
  ];
  const hasAdjustment = hasActiveAdjustment(item);
  const itemNumberPrefix = group?.itemNumberPrefix || "";
  const itemNumberSuffix = group?.itemNumberSuffix || "";
  const formattedItemNumber = getGroupItemNumber(group, item.itemNumber);

  const resetFinalTotalInput = () => {
    setFinalTotalInput(roundToTwo(finalTotal).toFixed(2));
  };

  const submitFinalTotal = () => {
    const parsedTarget = parseFloat(finalTotalInput);
    if (Number.isNaN(parsedTarget)) {
      resetFinalTotalInput();
      return;
    }

    const roundedTarget = roundToTwo(parsedTarget);
    if (Math.abs(roundedTarget - finalTotal) <= 0.01) {
      setFinalTotalInput(roundedTarget.toFixed(2));
      return;
    }

    const currentAdjustmentValue = getAppliedAdjustmentValue(item);
    const baseWithoutAdjustment = finalTotal - currentAdjustmentValue;

    setAdjustmentPrompt({
      targetTotal: roundedTarget,
      currentTotal: roundToTwo(finalTotal),
      adjustmentName: adjustmentEntry?.name || "Adjustment",
      nextAdjustmentValue: roundToTwo(roundedTarget - baseWithoutAdjustment),
    });
  };

  const handleApplyFinalTotalAdjustment = (adjustmentName) => {
    if (!adjustmentPrompt) return;

    const nextItem = syncItemFinalTotal(item, adjustmentPrompt.targetTotal, adjustmentName);
    updateItem(item.id, "others", nextItem.others);
    setAdjustmentPrompt(null);
  };

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:items-center">
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="w-full md:w-48">
                <div className="flex rounded border border-slate-300 bg-white transition-shadow focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                  {itemNumberPrefix && (
                    <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500">
                      {itemNumberPrefix}
                    </span>
                  )}
                  <input
                    type="text"
                    value={item.itemNumber}
                    onChange={(event) => updateItem(item.id, "itemNumber", event.target.value)}
                    placeholder="Item #"
                    className="min-w-0 flex-1 border-0 bg-transparent px-3 py-1.5 font-bold text-slate-800 focus:outline-none"
                  />
                  {itemNumberSuffix && (
                    <span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500">
                      {itemNumberSuffix}
                    </span>
                  )}
                </div>
                {(itemNumberPrefix || itemNumberSuffix) && (
                  <p className="mt-1 text-xs text-slate-500">
                    Final item #: {formattedItemNumber || "Untitled"}
                  </p>
                )}
              </div>
              <input
                type="text"
                value={item.itemName || ""}
                onChange={(event) => updateItem(item.id, "itemName", event.target.value)}
                placeholder="Item Name"
                className="flex-1 rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="text"
                value={item.uom || ""}
                onChange={(event) => updateItem(item.id, "uom", event.target.value)}
                placeholder="UOM (e.g. Each, Hrs)"
                className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 md:w-32"
              />
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Pricing Status
              </span>
              <PricingStatusToggle
                value={item.pricingStatus || "priced"}
                onChange={(value) => updateItem(item.id, "pricingStatus", value)}
              />
            </div>
            <input
              type="text"
              value={item.description}
              onChange={(event) => updateItem(item.id, "description", event.target.value)}
              placeholder="Item Description"
              className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => removeItem(item.id)}
            className="mt-1 shrink-0 p-2 text-slate-400 transition-colors hover:text-red-500 sm:mt-0"
            title="Delete Item"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-4 md:p-6">
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Base Values
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <NumberInput
                label="Material"
                value={item.material}
                onChange={(value) => updateItem(item.id, "material", value)}
              />
              <NumberInput
                label="Labor"
                value={item.labor}
                onChange={(value) => updateItem(item.id, "labor", value)}
              />
              <NumberInput
                label="Equipment"
                value={item.equipment}
                onChange={(value) => updateItem(item.id, "equipment", value)}
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                <Settings2 className="h-4 w-4" />
                Other Amounts & Discounts
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => addOther("amount")}
                  className="flex items-center gap-1.5 rounded bg-slate-100 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-200"
                >
                  <Plus className="h-4 w-4" />
                  Add Amount
                </button>
                <button
                  onClick={() => addOther("discount")}
                  className="flex items-center gap-1.5 rounded bg-blue-50 px-3 py-1.5 text-sm text-blue-700 transition-colors hover:bg-blue-100"
                >
                  <Percent className="h-4 w-4" />
                  Add Discount
                </button>
                <button
                  onClick={() => addOther("info")}
                  className="flex items-center gap-1.5 rounded bg-violet-50 px-3 py-1.5 text-sm text-violet-700 transition-colors hover:bg-violet-100"
                >
                  <Info className="h-4 w-4" />
                  Add Info
                </button>
              </div>
            </div>

            {item.others.length === 0 ? (
              <p className="text-sm italic text-slate-400">No additional amounts or discounts applied.</p>
            ) : (
              <div className="space-y-3">
                {item.others.map((other) => {
                  const isActive = other.isActive !== false;

                  return (
                    <div
                      key={other.id}
                      className={`rounded-lg border p-3 transition-all ${
                        !isActive ? "opacity-50 grayscale" : ""
                      } ${
                        other.type === "discount"
                          ? "border-blue-100 bg-blue-50/50"
                          : other.type === "info"
                            ? "border-violet-100 bg-violet-50/50"
                            : other.isAdjustment
                              ? "border-emerald-200 bg-emerald-50/60"
                              : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      {other.type === "info" ? (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <Info className="hidden h-4 w-4 text-violet-400 sm:block" />
                          <input
                            type="text"
                            value={other.name}
                            onChange={(event) => updateOther(other.id, "name", event.target.value)}
                            disabled={!isActive}
                            placeholder="Info Label (e.g. Note, Link)"
                            className="min-w-[150px] flex-1 rounded border border-violet-200 bg-white px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none disabled:bg-slate-50 sm:max-w-[200px]"
                          />
                          <div className="flex w-full items-center gap-2">
                            <input
                              type="text"
                              value={other.value}
                              onChange={(event) => updateOther(other.id, "value", event.target.value)}
                              disabled={!isActive}
                              placeholder="Information Details..."
                              className="w-full rounded border border-violet-200 bg-white px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none disabled:bg-slate-50"
                            />
                            <button
                              onClick={() => updateOther(other.id, "isActive", !isActive)}
                              className="rounded p-1.5 text-slate-400 hover:text-slate-600"
                              title={isActive ? "Deactivate" : "Activate"}
                            >
                              {isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={() => removeOther(other.id)}
                              className="rounded p-1.5 text-slate-400 hover:text-red-500"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : other.type === "amount" ? (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <Tag
                            className={`hidden h-4 w-4 sm:block ${
                              other.isAdjustment ? "text-emerald-500" : "text-slate-400"
                            }`}
                          />
                          <input
                            type="text"
                            value={other.name}
                            onChange={(event) => updateOther(other.id, "name", event.target.value)}
                            disabled={!isActive}
                            placeholder="Amount Name (e.g. Tax, Fee)"
                            className="min-w-[150px] flex-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-50"
                          />
                          <div className="flex w-full items-center gap-2 sm:w-auto">
                            <span className="font-medium text-slate-500">$</span>
                            <input
                              type="number"
                              step="any"
                              value={other.value}
                              onChange={(event) => updateOther(other.id, "value", event.target.value)}
                              disabled={!isActive}
                              placeholder="0.00"
                              className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-50 sm:w-32"
                            />
                            <button
                              onClick={() => updateOther(other.id, "isActive", !isActive)}
                              className="rounded p-1.5 text-slate-400 hover:text-slate-600"
                              title={isActive ? "Deactivate" : "Activate"}
                            >
                              {isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={() => removeOther(other.id)}
                              className="rounded p-1.5 text-slate-400 hover:text-red-500"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <Percent className="hidden h-4 w-4 text-blue-400 sm:block" />
                            <input
                              type="text"
                              value={other.name}
                              onChange={(event) => updateOther(other.id, "name", event.target.value)}
                              disabled={!isActive}
                              placeholder="Discount Name"
                              className="min-w-[150px] flex-1 rounded border border-blue-200 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-50"
                            />
                            <div className="flex w-full items-center gap-2 sm:w-auto">
                              <input
                                type="number"
                                step="any"
                                value={other.percent}
                                onChange={(event) => updateOther(other.id, "percent", event.target.value)}
                                disabled={!isActive}
                                placeholder="0"
                                className="w-full rounded border border-blue-200 bg-white px-3 py-1.5 text-right text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-50 sm:w-24"
                              />
                              <span className="font-medium text-blue-600">%</span>
                              <button
                                onClick={() => updateOther(other.id, "isActive", !isActive)}
                                className="ml-1 rounded p-1.5 text-slate-400 hover:text-slate-600"
                                title={isActive ? "Deactivate" : "Activate"}
                              >
                                {isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                              </button>
                              <button
                                onClick={() => removeOther(other.id)}
                                className="rounded p-1.5 text-slate-400 hover:text-red-500"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          <div className="ml-0 flex flex-col gap-4 rounded border border-blue-50 bg-white/60 p-3 sm:ml-7 md:flex-row">
                            <div className="flex-1">
                              <div className="mb-2 flex items-center justify-between">
                                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Applies To:
                                </label>
                                <button
                                  onClick={() => {
                                    const allTargets = availableTargets.map((target) => target.id);
                                    const isAllSelected =
                                      other.targets.length === allTargets.length && allTargets.length > 0;
                                    updateOther(other.id, "targets", isAllSelected ? [] : allTargets);
                                  }}
                                  className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-800"
                                >
                                  {other.targets.length === availableTargets.length &&
                                  availableTargets.length > 0
                                    ? "Deselect All"
                                    : "Select All"}
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {availableTargets.map((target) => {
                                  const isSelected = other.targets.includes(target.id);

                                  return (
                                    <button
                                      key={target.id}
                                      onClick={() => {
                                        const newTargets = isSelected
                                          ? other.targets.filter((selectedTarget) => selectedTarget !== target.id)
                                          : [...other.targets, target.id];
                                        updateOther(other.id, "targets", newTargets);
                                      }}
                                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                                        isSelected
                                          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                                          : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                                      }`}
                                    >
                                      {target.label}
                                    </button>
                                  );
                                })}
                                {availableTargets.length === 0 && (
                                  <span className="text-xs text-slate-400">No targets available.</span>
                                )}
                              </div>
                            </div>

                            <div className="w-full shrink-0 md:w-48">
                              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Rounding Method:
                              </label>
                              <select
                                value={other.rounding}
                                onChange={(event) => updateOther(other.id, "rounding", event.target.value)}
                                disabled={!isActive}
                                className="w-full cursor-pointer rounded border border-blue-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50"
                              >
                                <option value="sum_first">Sum targets, apply %, then round</option>
                                <option value="round_first">Apply % to each, round, then sum</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-slate-200 pt-6">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
              <div className="flex-1 space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">
                <div className="flex justify-between">
                  <span>Base Subtotal:</span>
                  <span>${calculation.baseTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Other Amounts:</span>
                  <span>${calculation.otherAmountsTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium text-blue-600">
                  <span>Total Discounts:</span>
                  <span>-${calculation.discountsTotal.toFixed(2)}</span>
                </div>
                <div className="my-1 flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-700">
                  <span>Calculated Total:</span>
                  <span>${calculation.calculatedTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex flex-1 flex-col items-end">
                <div
                  className={`w-full max-w-xs rounded-xl border-2 p-4 transition-colors ${
                    hasAdjustment ? "border-blue-200 bg-blue-50" : "border-green-200 bg-green-50"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span
                      className={`text-xs font-bold uppercase tracking-wider ${
                        hasAdjustment ? "text-blue-700" : "text-green-600"
                      }`}
                    >
                      Final Total
                    </span>
                    {hasAdjustment && (
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                        Adjustment Applied
                      </span>
                    )}
                  </div>

                  <div className="relative mt-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-500">
                      $
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={finalTotalInput}
                      onChange={(event) => setFinalTotalInput(event.target.value)}
                      onBlur={submitFinalTotal}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          submitFinalTotal();
                        }
                      }}
                      className={`w-full rounded-lg bg-white py-2 pl-8 pr-3 text-2xl font-bold text-slate-800 focus:outline-none focus:ring-2 ${
                        hasAdjustment
                          ? "border border-blue-300 focus:border-blue-500 focus:ring-blue-200"
                          : "border border-green-300 focus:border-green-500 focus:ring-green-200"
                      }`}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Edit this total directly. If it does not match the current math, you will be prompted
                    to add or update an adjustment amount.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {adjustmentPrompt && (
        <FinalTotalAdjustmentModal
          prompt={adjustmentPrompt}
          onClose={() => {
            setAdjustmentPrompt(null);
            resetFinalTotalInput();
          }}
          onConfirm={handleApplyFinalTotalAdjustment}
        />
      )}
    </>
  );
}

function NumberInput({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium text-slate-400">$</span>
        <input
          type="number"
          step="any"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0.00"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-7 pr-3 transition-shadow focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}

function PricingStatusToggle({ value, onChange, compact = false }) {
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3"}`}>
      {PRICING_STATUS_OPTIONS.map((option) => {
        const isSelected = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              isSelected
                ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                : "border-slate-300 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50"
            } ${compact ? "min-w-0" : ""}`}
          >
            <span className="block break-words">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ImportModal({ group, onClose, onImport, existingItemCount }) {
  const [rawText, setRawText] = useState("");
  const [parsedData, setParsedData] = useState([]);
  const [headerRowCount, setHeaderRowCount] = useState(1);
  const [mappings, setMappings] = useState([]);
  const [defaultPricingStatus, setDefaultPricingStatus] = useState("priced");
  const [itemNumberPrefix, setItemNumberPrefix] = useState(group?.itemNumberPrefix || "");
  const [itemNumberSuffix, setItemNumberSuffix] = useState(group?.itemNumberSuffix || "");
  const [savedTemplates, setSavedTemplates] = useState(() =>
    normalizeStoredImportTemplates(readJsonStorage(ESTIMATOR_IMPORT_TEMPLATES_STORAGE_KEY, [])),
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);

  const createEmptyMapping = () => ({
    type: "ignore",
    customName: "",
    defaultName: "",
    targets: [],
    isFixed: false,
    fixedValue: "",
    defaultActive: true,
  });

  useEffect(() => {
    writeJsonStorage(ESTIMATOR_IMPORT_TEMPLATES_STORAGE_KEY, savedTemplates);
  }, [savedTemplates]);

  useEffect(() => {
    setItemNumberPrefix(group?.itemNumberPrefix || "");
    setItemNumberSuffix(group?.itemNumberSuffix || "");
  }, [group]);

  const getCombinedHeaderFromRows = (rows, headerRows, colIndex) => {
    if (headerRows === 0) return `Column ${colIndex + 1}`;

    const headerText = [];
    for (let index = 0; index < headerRows; index += 1) {
      if (rows[index] && rows[index][colIndex]) {
        headerText.push(rows[index][colIndex].trim());
      }
    }

    return headerText.join(" ").trim() || `Column ${colIndex + 1}`;
  };

  const refreshAutoMappingNames = (sourceMappings, nextHeaderRows, rows = parsedData) =>
    sourceMappings.map((map, index) => {
      if (!map || map.isFixed || !map.type.startsWith("other_") || map.customName) {
        return map;
      }

      return {
        ...map,
        defaultName: getCombinedHeaderFromRows(rows, nextHeaderRows, index),
      };
    });

  const handlePaste = (event) => {
    const text = event.target.value;
    setRawText(text);

    if (!text.trim()) {
      setParsedData([]);
      setMappings([]);
      return;
    }

    let delimiter = "\t";
    if (text.indexOf("\t") === -1 && text.indexOf(",") !== -1) {
      delimiter = ",";
    }

    const rows = text
      .split("\n")
      .filter((row) => row.trim() !== "")
      .map((row) => row.split(delimiter));

    setParsedData(rows);
    setSelectedTemplateId("");

    const colCount = Math.max(...rows.map((row) => row.length));
    const nextMappings = Array(colCount).fill(null).map(createEmptyMapping);

    setMappings(nextMappings);
  };

  const getCombinedHeader = (colIndex) => {
    if (mappings[colIndex]?.isFixed) {
      return mappings[colIndex].customName || `Fixed Col ${colIndex + 1}`;
    }
    return getCombinedHeaderFromRows(parsedData, headerRowCount, colIndex);
  };

  const updateMapping = (index, field, value) => {
    setMappings((currentMappings) => {
      const nextMappings = [...currentMappings];
      nextMappings[index] = { ...nextMappings[index], [field]: value };
      return nextMappings;
    });
  };

  const getResolvedMappingName = (map, colIndex) =>
    map.customName || map.defaultName || getCombinedHeader(colIndex);

  const handleMappingTypeChange = (index, nextType) => {
    setMappings((currentMappings) => {
      const nextMappings = [...currentMappings];
      const currentMapping = nextMappings[index];
      const nextDefaultName = nextType.startsWith("other_")
        ? currentMapping.defaultName ||
          currentMapping.customName ||
          getCombinedHeader(index)
        : "";

      nextMappings[index] = {
        ...currentMapping,
        type: nextType,
        defaultName: nextDefaultName,
        targets: nextType === "other_discount" ? currentMapping.targets : [],
      };
      return nextMappings;
    });
  };

  const createTemplateMappings = () =>
    mappings.map((map, index) => ({
      type: map.type,
      isFixed: map.isFixed === true,
      fixedValue: map.fixedValue || "",
      defaultActive: map.defaultActive !== false,
      targets: Array.isArray(map.targets) ? [...map.targets] : [],
      customName: map.isFixed ? getResolvedMappingName(map, index) : map.customName || "",
    }));

  const applyTemplateById = (templateId) => {
    const template = savedTemplates.find((currentTemplate) => currentTemplate.id === templateId);
    if (!template) return;

    const parsedColumnCount = parsedData.reduce(
      (maxColumns, row) => Math.max(maxColumns, row.length),
      0,
    );
    const nextHeaderRows =
      typeof template.headerRowCount === "number" ? template.headerRowCount : headerRowCount;
    const nextMappings = Array.from(
      { length: Math.max(parsedColumnCount, template.mappings.length) },
      () => createEmptyMapping(),
    );

    template.mappings.forEach((templateMap, index) => {
      const isFixed = templateMap.isFixed === true;
      const type = typeof templateMap.type === "string" ? templateMap.type : "ignore";
      const customName = typeof templateMap.customName === "string" ? templateMap.customName : "";

      nextMappings[index] = {
        ...createEmptyMapping(),
        type,
        customName,
        defaultName:
          isFixed || !type.startsWith("other_")
            ? isFixed
              ? customName || `Fixed Col ${index + 1}`
              : ""
            : getCombinedHeaderFromRows(parsedData, nextHeaderRows, index),
        targets: Array.isArray(templateMap.targets) ? templateMap.targets : [],
        isFixed,
        fixedValue: typeof templateMap.fixedValue === "string" ? templateMap.fixedValue : "",
        defaultActive: templateMap.defaultActive !== false,
      };
    });

    setSelectedTemplateId(template.id);
    setHeaderRowCount(nextHeaderRows);
    setDefaultPricingStatus(template.defaultPricingStatus || "priced");
    setMappings(refreshAutoMappingNames(nextMappings, nextHeaderRows, parsedData));
  };

  const handleSaveTemplate = (name) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const existingTemplate = savedTemplates.find(
      (template) => template.name.toLowerCase() === trimmedName.toLowerCase(),
    );
    const nextTemplate = {
      id: existingTemplate?.id || generateId(),
      name: trimmedName,
      headerRowCount,
      defaultPricingStatus,
      mappings: createTemplateMappings(),
    };

    setSavedTemplates((currentTemplates) => {
      if (existingTemplate) {
        return currentTemplates.map((template) =>
          template.id === existingTemplate.id ? nextTemplate : template,
        );
      }

      return [...currentTemplates, nextTemplate];
    });
    setSelectedTemplateId(nextTemplate.id);
    setShowSaveTemplateModal(false);
  };

  const toggleTarget = (mapIndex, targetValue) => {
    const currentTargets = mappings[mapIndex].targets || [];
    const nextTargets = currentTargets.includes(targetValue)
      ? currentTargets.filter((target) => target !== targetValue)
      : [...currentTargets, targetValue];

    updateMapping(mapIndex, "targets", nextTargets);
  };

  const addFixedColumn = () => {
    setMappings((currentMappings) => [
      ...currentMappings,
      {
        ...createEmptyMapping(),
        customName: "New Column",
        defaultName: "New Column",
        isFixed: true,
      },
    ]);
  };

  const parseImportNumber = (value) => {
    if (!value) return "";

    const parsed = parseFloat(value.replace(/[^0-9.-]+/g, ""));
    return Number.isNaN(parsed) ? "" : parsed.toString();
  };

  const getRowValue = (row, map, colIdx) => {
    const cellValue = map.isFixed ? map.fixedValue : row[colIdx];
    return cellValue ? cellValue.trim() : "";
  };

  const analyzeImportRow = (row, rowIndex) => {
    const populatedCells = row.map((cell) => cell.trim()).filter(Boolean);
    if (populatedCells.length === 0) {
      return {
        kind: "empty",
        row,
        rowNumber: rowIndex + 1,
        text: "",
      };
    }

    const firstPopulatedCell = populatedCells[0];
    const firstCellWordCount = firstPopulatedCell.split(/\s+/).filter(Boolean).length;
    const looksLikeStandaloneNote =
      populatedCells.length === 1 &&
      (firstPopulatedCell.length >= IMPORT_NOTE_MIN_LENGTH ||
        /[.!?]/.test(firstPopulatedCell) ||
        firstCellWordCount >= 4);

    if (looksLikeStandaloneNote) {
      return {
        kind: "note",
        row,
        rowNumber: rowIndex + 1,
        text: firstPopulatedCell,
      };
    }

    return {
      kind: "item",
      row,
      rowNumber: rowIndex + 1,
      text: populatedCells.join(" | "),
    };
  };

  const analyzedImportRows = useMemo(
    () =>
      parsedData
        .slice(headerRowCount)
        .map((row, index) => analyzeImportRow(row, headerRowCount + index)),
    [parsedData, headerRowCount, mappings],
  );

  const skippedNoteRows = analyzedImportRows.filter((row) => row.kind === "note");
  const importableRows = analyzedImportRows.filter((row) => row.kind === "item");
  const hasMappedColumns = mappings.some((mapping) => mapping.type !== "ignore");

  const handleImport = () => {
    const newItems = [];

    for (const analyzedRow of importableRows) {
      const row = analyzedRow.row || [];
      const newItem = {
        ...createEmptyEstimatorItem(""),
        pricingStatus: defaultPricingStatus,
      };

      let importedTotalValue = null;
      const rowAmountIds = {};

      mappings.forEach((map, colIdx) => {
        if (!map || map.type === "ignore") return;

        const cellValue = map.isFixed ? map.fixedValue : row[colIdx];
        const value = cellValue ? cellValue.trim() : "";

        if (["itemNumber", "itemName", "description", "uom"].includes(map.type)) {
          newItem[map.type] = value;
        } else if (["material", "labor", "equipment"].includes(map.type)) {
          newItem[map.type] = parseImportNumber(value);
        } else if (map.type === "total") {
          const parsedValue = parseFloat(parseImportNumber(value));
          if (!Number.isNaN(parsedValue)) importedTotalValue = parsedValue;
        } else if (map.type === "other_amount" && value) {
          const amountId = generateId();
          rowAmountIds[colIdx] = amountId;
          newItem.others.push({
            id: amountId,
            type: "amount",
            name: getResolvedMappingName(map, colIdx),
            value: parseImportNumber(value),
            isActive: map.defaultActive !== false,
          });
        } else if (map.type === "other_info" && value) {
          newItem.others.push({
            id: generateId(),
            type: "info",
            name: getResolvedMappingName(map, colIdx),
            value,
            isActive: map.defaultActive !== false,
          });
        }
      });

      mappings.forEach((map, colIdx) => {
        if (map.type !== "other_discount") return;

        const cellValue = map.isFixed ? map.fixedValue : row[colIdx];
        const value = cellValue ? cellValue.trim() : "";
        const pctValue = parseImportNumber(value);

        if (!pctValue) return;

        const mappedTargets = (map.targets || [])
          .map((target) => {
            if (["material", "labor", "equipment"].includes(target)) return target;
            return rowAmountIds[target] || null;
          })
          .filter(Boolean);

        newItem.others.push({
          id: generateId(),
          type: "discount",
          name: getResolvedMappingName(map, colIdx),
          percent: pctValue,
          targets: mappedTargets,
          rounding: "sum_first",
          isActive: map.defaultActive !== false,
        });
      });

      const normalizedItem =
        importedTotalValue !== null
          ? syncItemFinalTotal(newItem, importedTotalValue, "Adjustment")
          : newItem;

      if (!normalizedItem.itemNumber) {
        normalizedItem.itemNumber = `IMP-${existingItemCount + newItems.length + 1}`;
      }

      newItems.push(normalizedItem);
    }

    onImport({
      items: newItems,
      itemNumberPrefix,
      itemNumberSuffix,
      skippedNotes: skippedNoteRows.map(({ rowNumber, text }) => ({ rowNumber, text })),
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
        <div className="flex max-h-[90vh] w-[min(96vw,1800px)] max-w-none flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
            <div className="flex items-center gap-2 text-lg font-bold text-slate-800">
              <TableProperties className="h-5 w-5 text-emerald-600" />
              Import Data from Spreadsheet
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto bg-white p-6">
            <div className="shrink-0">
              <label className="mb-2 block text-sm font-semibold text-slate-700">1. Paste your data</label>
              <textarea
                value={rawText}
                onChange={handlePaste}
                placeholder="Paste cells from Excel or Google Sheets here..."
                className="h-32 w-full resize-none rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {parsedData.length > 0 && (
              <div className="flex shrink-0 flex-col gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    2. Set imported item status
                  </label>
                  <p className="mb-3 text-sm text-slate-500">
                    This applies to every imported row. You can still change each item one by one afterward.
                  </p>
                  <PricingStatusToggle
                    value={defaultPricingStatus}
                    onChange={setDefaultPricingStatus}
                    compact
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    3. Group item number format
                  </label>
                  <p className="mb-3 text-sm text-slate-500">
                    These affixes apply to this group before and after import, so the item numbers render
                    the same way for existing and new rows.
                  </p>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),minmax(0,1fr),220px]">
                    <input
                      type="text"
                      value={itemNumberPrefix}
                      onChange={(event) => setItemNumberPrefix(event.target.value)}
                      placeholder="Prefix, e.g. 110-"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <input
                      type="text"
                      value={itemNumberSuffix}
                      onChange={(event) => setItemNumberSuffix(event.target.value)}
                      placeholder="Suffix, e.g. -ALT"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
                      <span className="font-semibold text-slate-800">Preview:</span>{" "}
                      {getGroupItemNumber({ itemNumberPrefix, itemNumberSuffix }, "12345") || "12345"}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        4. Saved Map Templates
                      </label>
                      <p className="text-sm text-slate-500">
                        Save this mapping by column position and reuse it later, even when the imported
                        header text changes. Templates are cached locally in this browser.
                      </p>
                    </div>
                    <div className="flex w-full max-w-2xl flex-col gap-3 sm:flex-row">
                      <select
                        value={selectedTemplateId}
                        onChange={(event) => {
                          const nextTemplateId = event.target.value;
                          setSelectedTemplateId(nextTemplateId);
                          if (nextTemplateId) {
                            applyTemplateById(nextTemplateId);
                          }
                        }}
                        disabled={savedTemplates.length === 0}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="">
                          {savedTemplates.length === 0
                            ? "No saved templates yet"
                            : "Select saved template..."}
                        </option>
                        {savedTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setShowSaveTemplateModal(true)}
                        disabled={!hasMappedColumns}
                        className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Save Map Template
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <label className="block text-sm font-semibold text-slate-700">5. Map columns to fields</label>
                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      onClick={addFixedColumn}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700"
                    >
                      <Plus className="h-4 w-4" />
                      Add Fixed Column
                    </button>
                    <div className="flex items-center gap-3 border-l border-slate-200 pl-4 text-sm font-medium text-slate-600">
                      <label htmlFor="headerRows" className="cursor-pointer">
                        Header Rows:
                      </label>
                      <input
                        id="headerRows"
                        type="number"
                        min="0"
                        max={Math.max(0, parsedData.length - 1)}
                        value={headerRowCount}
                        onChange={(event) => {
                          const value = Number.parseInt(event.target.value, 10);
                          const nextHeaderRows = Number.isNaN(value) ? 0 : value;
                          setHeaderRowCount(nextHeaderRows);
                          setMappings((currentMappings) =>
                            refreshAutoMappingNames(currentMappings, nextHeaderRows, parsedData),
                          );
                        }}
                        className="w-16 rounded border border-slate-300 px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                {skippedNoteRows.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                      <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-amber-900">
                          Detected non-item rows that will be skipped
                        </h3>
                        <p className="mt-1 text-sm text-amber-800">
                          These rows look like notes or callouts rather than importable items.
                        </p>
                        <div className="mt-3 space-y-2 text-sm text-amber-900">
                          {skippedNoteRows.map((note, index) => (
                            <div
                              key={`${note.rowNumber}-${index}`}
                              className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2"
                            >
                              <span className="mr-2 font-semibold text-amber-700">
                                Row {note.rowNumber}:
                              </span>
                              <span className="break-words">{note.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                  <table className="w-full table-fixed text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50">
                      <tr>
                        {mappings.map((map, index) => (
                          <th
                            key={index}
                            className="w-auto max-w-0 border-r border-slate-200 p-3 align-top font-normal last:border-r-0"
                          >
                            <div className="flex min-w-0 w-full flex-col gap-2">
                              <select
                                value={map.type}
                                onChange={(event) => handleMappingTypeChange(index, event.target.value)}
                                className={`w-full min-w-0 rounded-lg border px-2 py-1.5 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                                  map.type !== "ignore"
                                    ? "border-emerald-400 bg-emerald-50 font-medium text-emerald-900"
                                    : "border-slate-300 bg-white text-slate-700"
                                }`}
                              >
                                <option value="ignore">-- Ignore Column --</option>
                                <option value="itemNumber">Item #</option>
                                <option value="itemName">Item Name</option>
                                <option value="description">Description</option>
                                <option value="uom">UOM</option>
                                <option value="material">Material Cost</option>
                                <option value="labor">Labor Cost</option>
                                <option value="equipment">Equipment Cost</option>
                                <option value="total">Final Total</option>
                                <option value="other_amount">+ Create Amount...</option>
                                <option value="other_discount">+ Create Discount %...</option>
                                <option value="other_info">+ Create Info...</option>
                              </select>

                              {map.type.startsWith("other_") && (
                                <div className="flex min-w-0 items-center gap-2">
                                  <input
                                    type="text"
                                    value={getResolvedMappingName(map, index)}
                                    onChange={(event) => updateMapping(index, "customName", event.target.value)}
                                    placeholder="Column label"
                                    className="w-full min-w-0 rounded-lg border border-emerald-300 bg-white px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateMapping(
                                        index,
                                        "defaultActive",
                                        map.defaultActive === false ? true : false,
                                      )
                                    }
                                    className={`flex-shrink-0 rounded border p-1.5 transition-colors ${
                                      map.defaultActive !== false
                                        ? "border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                        : "border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200"
                                    }`}
                                    title={map.defaultActive !== false ? "Import as Active" : "Import as Inactive"}
                                  >
                                    {map.defaultActive !== false ? (
                                      <Eye className="h-4 w-4" />
                                    ) : (
                                      <EyeOff className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              )}

                              {map.type === "other_discount" && (
                                <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs">
                                  <div className="mb-1.5 flex items-center justify-between">
                                    <div className="font-semibold text-emerald-800">Applies To:</div>
                                    <button
                                      onClick={() => {
                                        const allTargets = [
                                          "material",
                                          "labor",
                                          "equipment",
                                          ...mappings
                                            .map((mapping, mappingIndex) =>
                                              mapping.type === "other_amount" ? mappingIndex : null,
                                            )
                                            .filter((mappingIndex) => mappingIndex !== null),
                                        ];
                                        const isAllSelected =
                                          map.targets?.length === allTargets.length && allTargets.length > 0;
                                        updateMapping(index, "targets", isAllSelected ? [] : allTargets);
                                      }}
                                      className="font-medium text-emerald-600 transition-colors hover:text-emerald-800"
                                    >
                                      {map.targets?.length > 0 &&
                                      map.targets?.length ===
                                        3 + mappings.filter((mapping) => mapping.type === "other_amount").length
                                        ? "Deselect All"
                                        : "Select All"}
                                    </button>
                                  </div>
                                  <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1">
                                    {["material", "labor", "equipment"].map((target) => (
                                      <label key={target} className="flex cursor-pointer items-center gap-1.5">
                                        <input
                                          type="checkbox"
                                          checked={map.targets?.includes(target)}
                                          onChange={() => toggleTarget(index, target)}
                                          className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                                        />
                                        <span className="capitalize text-emerald-900">{target}</span>
                                      </label>
                                    ))}
                                    {mappings.map((mapping, mappingIndex) =>
                                      mapping.type === "other_amount" ? (
                                        <label
                                          key={mappingIndex}
                                          className="flex cursor-pointer items-center gap-1.5"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={map.targets?.includes(mappingIndex)}
                                            onChange={() => toggleTarget(index, mappingIndex)}
                                            className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                                          />
                                          <span className="max-w-[120px] truncate text-emerald-900">
                                            {getResolvedMappingName(mapping, mappingIndex)}
                                          </span>
                                        </label>
                                      ) : null,
                                    )}
                                  </div>
                                </div>
                              )}

                              {map.isFixed && map.type !== "ignore" && (
                                <input
                                  type="text"
                                  value={map.fixedValue}
                                  onChange={(event) => updateMapping(index, "fixedValue", event.target.value)}
                                  placeholder="Value for all rows"
                                  className="w-full min-w-0 rounded-lg border border-emerald-400 bg-emerald-100 px-2 py-1.5 text-xs font-medium text-emerald-900 focus:border-emerald-600 focus:outline-none"
                                />
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedData.slice(0, Math.max(5, headerRowCount + 3)).map((row, rowIndex) => (
                        <tr
                          key={rowIndex}
                          className={
                            rowIndex < headerRowCount
                              ? "bg-slate-100/70 italic text-slate-400"
                              : "hover:bg-slate-50"
                          }
                        >
                          {mappings.map((map, colIndex) => (
                            <td
                              key={colIndex}
                              className="max-w-0 whitespace-normal break-words border-r border-slate-100 p-3 align-top text-xs last:border-r-0"
                            >
                              {map.isFixed ? (
                                <span className="font-medium text-emerald-600">{map.fixedValue || "-"}</span>
                              ) : (
                                row[colIndex] || ""
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-right text-xs text-slate-500">
                  Showing preview of up to {Math.max(5, headerRowCount + 3)} rows. {parsedData.length} total
                  rows detected.
                </p>
              </div>
            )}
          </div>

          <div className="flex shrink-0 justify-end gap-3 rounded-b-2xl border-t border-slate-200 bg-slate-50 p-4">
            <button
              onClick={onClose}
              className="rounded-lg px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={parsedData.length === 0 || !hasMappedColumns || importableRows.length === 0}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Load {importableRows.length} Items
            </button>
          </div>
        </div>
      </div>
      {showSaveTemplateModal && (
        <NameModal
          confirmLabel="Save Template"
          description="Save the current import mapping as a reusable template. Saving with the same name will update that template."
          onClose={() => setShowSaveTemplateModal(false)}
          onSubmit={handleSaveTemplate}
          placeholder="Template name"
          title="Save Map Template"
        />
      )}
    </>
  );
}
