import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';

import {
  CreateButton,
  CreatePanel,
  useCreate,
} from '../components/CreatePanel';
import { EmptyState } from '../components/EmptyState';
import { IconProducts } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { LoadingAnnouncement, SkeletonTable } from '../components/Skeleton';
import { CREATE_PRODUCT, PRODUCTS, UPDATE_PRODUCT } from '../lib/queries';
import {
  formatMoney,
  parseMoneyToCents,
  type Product,
  QUOTE_UNITS,
  TAX_RATES,
} from '../lib/types';
import { TableWrap } from '../components/TableWrap';

const EMPTY_FORM = {
  name: '',
  articleNumber: '',
  unitPrice: '',
  unit: 'Stück',
  taxRatePercent: '19',
};

export const ProductsPage = () => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [showArchived, setShowArchived] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreate();

  const { data, loading, error } = useQuery<{ products: Product[] }>(PRODUCTS, {
    variables: { includeInactive: showArchived },
  });

  const refetchQueries = [PRODUCTS];
  const [createProduct, { loading: creating, error: createError }] =
    useMutation(CREATE_PRODUCT, { refetchQueries });
  const [updateProduct] = useMutation(UPDATE_PRODUCT, { refetchQueries });

  const handleSubmit = async (): Promise<boolean> => {
    setFormError(null);

    const unitPriceCents = parseMoneyToCents(form.unitPrice);

    if (unitPriceCents === null || unitPriceCents < 0) {
      setFormError('Bitte einen Preis eintragen, zum Beispiel 90,00.');

      return false;
    }

    const result = await createProduct({
      variables: {
        input: {
          name: form.name.trim(),
          ...(form.articleNumber.trim() === ''
            ? {}
            : { articleNumber: form.articleNumber.trim() }),
          unitPriceCents,
          unit: form.unit,
          taxRatePercent: Number(form.taxRatePercent),
        },
      },
    }).catch(() => null);

    if (result?.data === undefined || result.data === null) {
      return false;
    }

    setForm(EMPTY_FORM);

    return true;
  };

  const products = data?.products ?? [];

  return (
    <>
      <ObjectHeader
        kind="product"
        icon={IconProducts}
        label="Artikelstamm"
        anzahl={products.length}
        note="Vorlagen für Angebotspositionen. Preisänderungen hier gelten für das nächste Angebot, nie für ein bereits geschriebenes."
        actions={<CreateButton create={create} label="Neuer Artikel" />}
      />

      {(createError !== undefined || formError !== null) && (
        <div className="error-banner">{formError ?? createError?.message}</div>
      )}

      <CreatePanel
        create={create}
        submitLabel="Artikel anlegen"
        submitting={creating}
        onSubmit={handleSubmit}
      >
        <div className="field">
          <label htmlFor="product-name">Bezeichnung</label>
          <input
            id="product-name"
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="product-number">Artikelnummer</label>
          <input
            id="product-number"
            value={form.articleNumber}
            onChange={(event) =>
              setForm({ ...form, articleNumber: event.target.value })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="product-price">Einzelpreis netto</label>
          <input
            id="product-price"
            inputMode="decimal"
            placeholder="90,00"
            required
            value={form.unitPrice}
            onChange={(event) =>
              setForm({ ...form, unitPrice: event.target.value })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="product-unit">Einheit</label>
          <select
            id="product-unit"
            value={form.unit}
            onChange={(event) => setForm({ ...form, unit: event.target.value })}
          >
            {QUOTE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="product-tax">MwSt.</label>
          <select
            id="product-tax"
            value={form.taxRatePercent}
            onChange={(event) =>
              setForm({ ...form, taxRatePercent: event.target.value })
            }
          >
            {TAX_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate} %
              </option>
            ))}
          </select>
        </div>
      </CreatePanel>

      <div className="toolbar">
        <label className="toolbar__toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Archivierte anzeigen
        </label>
      </div>

      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}

      {loading && data === undefined ? (
        <>
          <LoadingAnnouncement />
          <SkeletonTable columns={5} />
        </>
      ) : products.length === 0 ? (
        <EmptyState
          title="Noch keine Artikel"
          description="Ein Artikel spart Tippen: Bezeichnung, Preis und Steuersatz werden beim Anlegen einer Position übernommen."
          action={
            <button
              type="button"
              className="button"
              onClick={() => create.setOpen(true)}
            >
              Ersten Artikel anlegen
            </button>
          }
        />
      ) : (
        <TableWrap>
          <table className="list-table">
            <thead>
              <tr>
                <th>Bezeichnung</th>
                <th>Nummer</th>
                <th className="numeric">Einzelpreis</th>
                <th>Einheit</th>
                <th className="numeric">MwSt.</th>
                <th>
                  <span className="visually-hidden">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  className={product.active ? '' : 'is-archived'}
                >
                  <td data-label="Bezeichnung">
                    {product.name}
                    {!product.active && (
                      <span className="badge"> archiviert</span>
                    )}
                  </td>
                  <td data-label="Nummer">{product.articleNumber ?? '—'}</td>
                  <td data-label="Einzelpreis" className="numeric">
                    {formatMoney(product.unitPriceCents)}
                  </td>
                  <td data-label="Einheit">{product.unit}</td>
                  <td data-label="MwSt." className="numeric">
                    {product.taxRatePercent} %
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button button--ghost row-action"
                      onClick={() =>
                        void updateProduct({
                          variables: {
                            input: { id: product.id, active: !product.active },
                          },
                        })
                      }
                    >
                      {product.active ? 'Archivieren' : 'Zurückholen'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
};
