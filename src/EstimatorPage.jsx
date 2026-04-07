import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  Calculator,
  Edit3,
  Eye,
  EyeOff,
  Info,
  Percent,
  Plus,
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

const IMPORT_NOTE_MIN_LENGTH = 20;

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
  overrideTotalFlag: false,
  overrideTotalValue: "",
});

const calculateItemTotals = (item) => {
  const mat = parseFloat(item.material) || 0;
  const lab = parseFloat(item.labor) || 0;
  const eq = parseFloat(item.equipment) || 0;

  let baseTotal = mat + lab + eq;
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

export default function EstimatorPage({ onBack }) {
  const [items, setItems] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [lastImportNotes, setLastImportNotes] = useState([]);

  const addItem = () => {
    setItems((currentItems) => [
      ...currentItems,
      createEmptyEstimatorItem(`ITEM-${currentItems.length + 1}`),
    ]);
  };

  const updateItem = (id, field, value) => {
    setItems((currentItems) =>
      currentItems.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const removeItem = (id) => {
    setItems((currentItems) => currentItems.filter((item) => item.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans text-slate-800 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-900">
              <Calculator className="h-8 w-8 text-blue-600" />
              Flexible Estimator
            </h1>
            <p className="mt-1 text-slate-500">
              Manage items, base costs, dynamic amounts, and targeted discounts.
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
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              <Upload className="h-5 w-5" />
              Import Data
            </button>
            <button
              onClick={addItem}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Plus className="h-5 w-5" />
              Add New Item
            </button>
          </div>
        </header>

        {lastImportNotes.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">Skipped non-item rows from the last import</h2>
                <p className="mt-1 text-sm text-amber-800">
                  These rows looked like notes or callouts, so they were not imported as items.
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  {lastImportNotes.map((note, index) => (
                    <div
                      key={`${note.rowNumber}-${index}`}
                      className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2"
                    >
                      <span className="mr-2 font-semibold text-amber-700">Row {note.rowNumber}:</span>
                      <span className="break-words">{note.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center text-slate-400">
            <Calculator className="mx-auto mb-3 h-12 w-12 opacity-50" />
            <p className="text-lg">No items added yet.</p>
            <p className="text-sm">Click "Add New Item" to begin.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} updateItem={updateItem} removeItem={removeItem} />
            ))}
          </div>
        )}

        {showImport && (
          <ImportModal
            existingItemCount={items.length}
            onClose={() => setShowImport(false)}
            onImport={({ items: newItems, skippedNotes }) => {
              setItems((currentItems) => [...currentItems, ...newItems]);
              setLastImportNotes(skippedNotes);
              setShowImport(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

function ItemCard({ item, updateItem, removeItem }) {
  const calculation = useMemo(() => calculateItemTotals(item), [item]);

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

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:items-center">
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              type="text"
              value={item.itemNumber}
              onChange={(event) => updateItem(item.id, "itemNumber", event.target.value)}
              placeholder="Item #"
              className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 md:w-32"
            />
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
                        <Tag className="hidden h-4 w-4 text-slate-400 sm:block" />
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
              <label className="group mb-3 flex cursor-pointer select-none items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.overrideTotalFlag}
                  onChange={(event) => updateItem(item.id, "overrideTotalFlag", event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-600 transition-colors group-hover:text-slate-800">
                  Override Calculated Total
                </span>
              </label>

              <div
                className={`w-full max-w-xs rounded-xl border-2 p-4 transition-colors ${
                  item.overrideTotalFlag ? "border-orange-200 bg-orange-50" : "border-green-200 bg-green-50"
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider ${
                      item.overrideTotalFlag ? "text-orange-600" : "text-green-600"
                    }`}
                  >
                    {item.overrideTotalFlag ? "Manual Total" : "Final Total"}
                  </span>
                  {item.overrideTotalFlag && <Edit3 className="h-4 w-4 text-orange-500" />}
                </div>

                {item.overrideTotalFlag ? (
                  <div className="relative mt-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-500">
                      $
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={item.overrideTotalValue}
                      onChange={(event) => updateItem(item.id, "overrideTotalValue", event.target.value)}
                      placeholder={calculation.calculatedTotal.toFixed(2)}
                      className="w-full rounded-lg border border-orange-300 bg-white py-2 pl-8 pr-3 text-2xl font-bold text-slate-800 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    />
                  </div>
                ) : (
                  <div className="mt-1 text-3xl font-bold text-slate-800">
                    ${calculation.calculatedTotal.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
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

function ImportModal({ onClose, onImport, existingItemCount }) {
  const [rawText, setRawText] = useState("");
  const [parsedData, setParsedData] = useState([]);
  const [headerRowCount, setHeaderRowCount] = useState(1);
  const [mappings, setMappings] = useState([]);
  const [defaultPricingStatus, setDefaultPricingStatus] = useState("priced");

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

    const colCount = Math.max(...rows.map((row) => row.length));
    const nextMappings = Array(colCount)
      .fill(null)
      .map(() => ({
        type: "ignore",
        customName: "",
        targets: [],
        isFixed: false,
        fixedValue: "",
        defaultActive: true,
      }));

    setMappings(nextMappings);
  };

  const getCombinedHeader = (colIndex) => {
    if (mappings[colIndex]?.isFixed) {
      return mappings[colIndex].customName || `Fixed Col ${colIndex + 1}`;
    }
    if (headerRowCount === 0) return `Column ${colIndex + 1}`;

    const headerText = [];
    for (let index = 0; index < headerRowCount; index += 1) {
      if (parsedData[index] && parsedData[index][colIndex]) {
        headerText.push(parsedData[index][colIndex].trim());
      }
    }

    return headerText.join(" ").trim() || `Column ${colIndex + 1}`;
  };

  const updateMapping = (index, field, value) => {
    setMappings((currentMappings) => {
      const nextMappings = [...currentMappings];
      nextMappings[index] = { ...nextMappings[index], [field]: value };
      return nextMappings;
    });
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
        type: "ignore",
        customName: "New Column",
        targets: [],
        isFixed: true,
        fixedValue: "",
        defaultActive: true,
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

    const mappedValues = mappings
      .map((map, colIdx) => ({ map, colIdx, value: map ? getRowValue(row, map, colIdx) : "" }))
      .filter(({ map }) => map && map.type !== "ignore");

    const itemNumberValue =
      mappedValues.find(({ map }) => map.type === "itemNumber")?.value || "";
    const itemNameValue = mappedValues.find(({ map }) => map.type === "itemName")?.value || "";
    const descriptionValue =
      mappedValues.find(({ map }) => map.type === "description")?.value || "";
    const hasNumericValue = mappedValues.some(
      ({ map, value }) =>
        ["material", "labor", "equipment", "total", "other_amount", "other_discount"].includes(
          map.type,
        ) && parseImportNumber(value) !== "",
    );

    const firstPopulatedCell = populatedCells[0];
    const firstCellWordCount = firstPopulatedCell.split(/\s+/).filter(Boolean).length;
    const looksLikeStandaloneNote =
      populatedCells.length === 1 &&
      (firstPopulatedCell.length >= IMPORT_NOTE_MIN_LENGTH ||
        /[.!?]/.test(firstPopulatedCell) ||
        firstCellWordCount >= 4);

    const looksLikeMappedNote =
      Boolean(itemNumberValue) &&
      !itemNameValue &&
      !descriptionValue &&
      !hasNumericValue &&
      (itemNumberValue.length >= IMPORT_NOTE_MIN_LENGTH ||
        /[.!?]/.test(itemNumberValue) ||
        itemNumberValue.split(/\s+/).filter(Boolean).length >= 4);

    if (looksLikeStandaloneNote || looksLikeMappedNote) {
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
            name: map.customName || getCombinedHeader(colIdx),
            value: parseImportNumber(value),
            isActive: map.defaultActive !== false,
          });
        } else if (map.type === "other_info" && value) {
          newItem.others.push({
            id: generateId(),
            type: "info",
            name: map.customName || getCombinedHeader(colIdx),
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
          name: map.customName || getCombinedHeader(colIdx),
          percent: pctValue,
          targets: mappedTargets,
          rounding: "sum_first",
          isActive: map.defaultActive !== false,
        });
      });

      if (importedTotalValue !== null) {
        const totals = calculateItemTotals(newItem);
        if (Math.abs(totals.calculatedTotal - importedTotalValue) > 0.01) {
          newItem.overrideTotalFlag = true;
          newItem.overrideTotalValue = importedTotalValue.toString();
        }
      }

      if (!newItem.itemNumber) {
        newItem.itemNumber = `IMP-${existingItemCount + newItems.length + 1}`;
      }

      newItems.push(newItem);
    }

    onImport({
      items: newItems,
      skippedNotes: skippedNoteRows.map(({ rowNumber, text }) => ({ rowNumber, text })),
    });
  };

  const hasMappedColumns = mappings.some((mapping) => mapping.type !== "ignore");

  return (
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

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <label className="block text-sm font-semibold text-slate-700">3. Map columns to fields</label>
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
                        setHeaderRowCount(Number.isNaN(value) ? 0 : value);
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
                              onChange={(event) => updateMapping(index, "type", event.target.value)}
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
                                  value={map.customName}
                                  onChange={(event) => updateMapping(index, "customName", event.target.value)}
                                  placeholder={getCombinedHeader(index)}
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
                                          {mapping.customName || getCombinedHeader(mappingIndex)}
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
  );
}
