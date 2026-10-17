import { useState } from "react";
import Icon from "../common/Icon";

const FLAVORS = [
  { flavor: "carne", label: "Carne" },
  { flavor: "pollo", label: "Pollo" },
];
const SIZES = [
  { size: 1, label: "Unidad suelta" },
  { size: 12, label: "Docena" },
];
export default function EmpanadaPriceSettings({ pricing }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const savedRows = FLAVORS.map(({ flavor }) => {
    const saved = pricing.query.data.find((item) => item.flavor === flavor);
    return {
      flavor,
      price_1: saved?.price_1 ?? "",
      price_12: saved?.price_12 ?? "",
    };
  });
  const displayedRows = rows ?? savedRows;

  function change(flavor, field, value) {
    setRows((current) =>
      (current ?? savedRows).map((row) =>
        row.flavor === flavor ? { ...row, [field]: value } : row,
      ),
    );
  }
  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      await pricing.save.mutateAsync(displayedRows);
    } catch (failure) {
      setError(failure.message);
    }
  }
  if (pricing.query.isPending) return <p role="status">Cargando precios…</p>;
  if (pricing.query.isError)
    return (
      <div role="alert">
        <p className="text-red-800">
          No se pudieron cargar los precios de empanadas. Ejecutá
          `empanadas-pedidos.sql` en Supabase.
        </p>
        <button
          type="button"
          className="libreta-secondary mt-3"
          onClick={() => pricing.query.refetch()}
        >
          Volver a intentar
        </button>
      </div>
    );
  return (
    <form onSubmit={submit} className="space-y-5">
      <p className="text-lg text-stone-600">
        Definí el precio por unidad y por docena. La media docena se calcula
        sola como la mitad del precio de la docena.
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        {FLAVORS.map(({ flavor, label }) => (
          <fieldset
            key={flavor}
            className="rounded-3xl border border-stone-200 bg-white p-5"
          >
            <legend className="px-2 text-2xl font-semibold">
              Empanadas de {label.toLowerCase()}
            </legend>
            <div className="mt-3 space-y-4">
              {SIZES.map(({ size, label: sizeLabel }) => (
                <label key={size} className="block text-lg">
                  {sizeLabel}
                  <span className="relative mt-1 block">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-600">
                      $
                    </span>
                    <input
                      className="libreta-input pl-10"
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      max="9999999999.99"
                      required
                      value={
                        displayedRows.find((row) => row.flavor === flavor)?.[
                          `price_${size}`
                        ] ?? ""
                      }
                      onChange={(event) =>
                        change(flavor, `price_${size}`, event.target.value)
                      }
                      disabled={pricing.save.isPending}
                    />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-lg text-red-800">
          {error}
        </p>
      )}
      <button className="libreta-button" disabled={pricing.save.isPending}>
        <Icon name="check" />
        {pricing.save.isPending ? "Guardando precios…" : "Guardar precios"}
      </button>
    </form>
  );
}
