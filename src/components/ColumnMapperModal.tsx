import { useState } from 'react';
import { Database, FileSpreadsheet, Upload, X } from 'lucide-react';
import type { CapacityConfig, ColumnMapping, DataQualityReport } from '../types/hospital';

interface ColumnMapperModalProps {
  isOpen: boolean;
  onClose: () => void;
  headers: string[];
  mapping: ColumnMapping;
  config: CapacityConfig;
  qualityReport: DataQualityReport;
  datasetName: string;
  onApplyMappingAndConfig: (nextMapping: ColumnMapping, nextConfig: CapacityConfig) => void;
  onUploadCsvFile: (file: File) => Promise<void>;
}

const REQUIRED_MAPPING_FIELDS: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
  { key: 'patientId', label: 'Patient / Record ID' },
  { key: 'department', label: 'Department / Unit', required: true },
  { key: 'arrivalDate', label: 'Arrival Date', required: true },
  { key: 'arrivalTime', label: 'Arrival Time' },
  { key: 'physician', label: 'Attending Physician / Staff' },
  { key: 'waitTime', label: 'Wait Time (Minutes)' },
  { key: 'serviceDuration', label: 'Service Duration (Minutes)' },
  { key: 'dischargeDate', label: 'Discharge Date' },
  { key: 'lengthOfStay', label: 'Length of Stay (Days)' },
  { key: 'satisfactionScore', label: 'Satisfaction Score' },
  { key: 'readmitted', label: 'Readmitted Within 30 Days' },
  { key: 'treatmentCost', label: 'Treatment Cost' },
  { key: 'staffCount', label: 'Direct Staff Count (Optional)' },
  { key: 'bedOccupancyPct', label: 'Direct Bed Occupancy % (Optional)' },
  { key: 'overtimeHours', label: 'Direct Overtime Hours (Optional)' },
];

export function ColumnMapperModal({
  isOpen,
  onClose,
  headers,
  mapping,
  config,
  qualityReport,
  datasetName,
  onApplyMappingAndConfig,
  onUploadCsvFile,
}: ColumnMapperModalProps) {
  const [draftMapping, setDraftMapping] = useState<ColumnMapping>(mapping);
  const [draftConfig, setDraftConfig] = useState<CapacityConfig>(config);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      await onUploadCsvFile(file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to parse CSV file.');
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onApplyMappingAndConfig(draftMapping, draftConfig);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2E36]/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mapper-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-md bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-[#0A2E36] px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-[#00A795]" />
            <div>
              <h2 id="mapper-modal-title" className="font-editorial-serif text-xl font-bold">
                Dataset Schema, Column Mapping & Capacity Model
              </h2>
              <p className="text-xs text-white/75">
                Active source: {datasetName} ({qualityReport.validRows.toLocaleString()} valid rows)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close schema and data quality modal"
            className="rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Upload custom CSV + Data Quality Summary */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-md border border-[#E5E7EB] p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[#1B1B2F]">
                <Upload className="h-4 w-4 text-[#02808F]" />
                Load Custom Hospital CSV
              </div>
              <p className="mt-1 text-xs text-[#6B7280]">
                Upload another CSV dataset to auto-detect headers and recompute all four sections.
              </p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#02808F] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0A2E36]">
                <FileSpreadsheet className="h-4 w-4" />
                <span>Choose CSV File</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
              {uploadError ? (
                <p className="mt-2 text-xs font-medium text-red-600">{uploadError}</p>
              ) : null}
            </div>

            <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-4">
              <div className="text-sm font-bold text-[#1B1B2F]">Data Quality Audit</div>
              <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <dt className="text-[#6B7280]">Parsed / Raw Rows</dt>
                  <dd className="font-tabular font-semibold text-[#1B1B2F]">
                    {qualityReport.validRows.toLocaleString()} / {qualityReport.totalRawRows.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Skipped Malformed</dt>
                  <dd className="font-tabular font-semibold text-[#02808F]">
                    {qualityReport.skippedRows}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Same-Day (0d LOS)</dt>
                  <dd className="font-tabular font-semibold text-[#1B1B2F]">
                    {qualityReport.sameDayZeroLosCount} visits
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Wait Anomalies / Nulls</dt>
                  <dd className="font-tabular font-semibold text-[#1B1B2F]">
                    {qualityReport.anomalyWaitCount} / {qualityReport.nullWaitCount}
                  </dd>
                </div>
              </dl>
              {qualityReport.unmappedOptionalFields.length > 0 ? (
                <p className="mt-2.5 text-[11px] leading-relaxed text-[#6B7280]">
                  Derived fields: {qualityReport.unmappedOptionalFields.join(' · ')}
                </p>
              ) : null}
            </div>
          </div>

          {/* Capacity Parameters */}
          <div className="rounded-md border border-[#E5E7EB] p-4">
            <h3 className="text-sm font-bold text-[#1B1B2F]">
              Operational Capacity & Financial Parameters
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label
                  htmlFor="cfg-beds"
                  className="block text-xs font-medium text-[#6B7280]"
                >
                  Total Licensed Beds
                </label>
                <input
                  id="cfg-beds"
                  type="number"
                  min={2}
                  max={2000}
                  value={draftConfig.totalLicensedBeds}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      totalLicensedBeds: Math.max(2, Number(e.target.value) || 16),
                    })
                  }
                  className="font-tabular mt-1 w-full rounded border border-[#E5E7EB] px-3 py-1.5 text-sm text-[#1B1B2F]"
                />
              </div>
              <div>
                <label
                  htmlFor="cfg-ratio"
                  className="block text-xs font-medium text-[#6B7280]"
                >
                  Target Patients / Clinician
                </label>
                <input
                  id="cfg-ratio"
                  type="number"
                  step={0.5}
                  min={1}
                  max={30}
                  value={draftConfig.targetPatientsPerClinician}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      targetPatientsPerClinician: Math.max(1, Number(e.target.value) || 4.5),
                    })
                  }
                  className="font-tabular mt-1 w-full rounded border border-[#E5E7EB] px-3 py-1.5 text-sm text-[#1B1B2F]"
                />
              </div>
              <div>
                <label
                  htmlFor="cfg-ot-rate"
                  className="block text-xs font-medium text-[#6B7280]"
                >
                  Overtime Rate (₦ / hr)
                </label>
                <input
                  id="cfg-ot-rate"
                  type="number"
                  step={500}
                  min={500}
                  value={draftConfig.overtimeRateNgnPerHour}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      overtimeRateNgnPerHour: Math.max(500, Number(e.target.value) || 12500),
                    })
                  }
                  className="font-tabular mt-1 w-full rounded border border-[#E5E7EB] px-3 py-1.5 text-sm text-[#1B1B2F]"
                />
              </div>
              <div>
                <label
                  htmlFor="cfg-occ-warn"
                  className="block text-xs font-medium text-[#6B7280]"
                >
                  Spike Warning Threshold (%)
                </label>
                <input
                  id="cfg-occ-warn"
                  type="number"
                  min={50}
                  max={100}
                  value={draftConfig.occupancyWarningPct}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      occupancyWarningPct: Math.min(
                        100,
                        Math.max(50, Number(e.target.value) || 85)
                      ),
                    })
                  }
                  className="font-tabular mt-1 w-full rounded border border-[#E5E7EB] px-3 py-1.5 text-sm text-[#1B1B2F]"
                />
              </div>
            </div>
          </div>

          {/* Column Mapping Dropdowns */}
          <div className="rounded-md border border-[#E5E7EB] p-4">
            <h3 className="text-sm font-bold text-[#1B1B2F]">Column Field Mapping</h3>
            <p className="mt-0.5 text-xs text-[#6B7280]">
              Auto-detected columns from your CSV header. Adjust any field if your source naming differs.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {REQUIRED_MAPPING_FIELDS.map((field) => (
                <div key={field.key}>
                  <label
                    htmlFor={`map-${field.key}`}
                    className="block text-xs font-medium text-[#1B1B2F]"
                  >
                    {field.label}
                    {field.required ? ' *' : ''}
                  </label>
                  <select
                    id={`map-${field.key}`}
                    value={draftMapping[field.key] ?? ''}
                    onChange={(e) =>
                      setDraftMapping({
                        ...draftMapping,
                        [field.key]: e.target.value || undefined,
                      })
                    }
                    className="mt-1 w-full rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#1B1B2F]"
                  >
                    <option value="">-- Not Mapped / Derive --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[#E5E7EB] px-4 py-2 text-xs font-semibold text-[#6B7280] hover:bg-[#F3F4F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#02808F] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0A2E36]"
            >
              Apply Mapping & Recalculate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
