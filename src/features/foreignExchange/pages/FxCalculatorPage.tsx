import { useMemo, useState } from 'react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Amount } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { formatCurrency } from '@/lib/app/format';
import { exchangeRateService } from '../services';
import { calculateRealizedFxGainLoss, calculateUnrealizedFxGainLoss, type FxPositionType } from '../services/fxCalculations';

type CalculationMode = 'realized' | 'unrealized';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A genuinely standalone FX gain/loss calculator — works with zero other
 * module dependencies, pure client-side arithmetic on user-typed numbers
 * via fxCalculations.ts. Route `/foreign-exchange/calculator`.
 *
 * SCOPE NOTE: this tool does not read from, or post to, any real
 * Invoice/Bill/Customer/Supplier/BankAccount — none of those types carry a
 * foreign transaction currency in this codebase yet. The optional
 * "look up rates" section below is a real integration with THIS module's
 * own ExchangeRateService (exchangeRateService.getRateForDate()) only —
 * it never invents or interpolates a rate: if no rate is on file for a
 * date, it says so and leaves the rate field for manual entry. Re-skinned
 * onto v0's PageHeader/SectionCard/Field (M13); no new calculation logic —
 * fxCalculations.ts is the sole source of the gain/loss figure.
 */
export function FxCalculatorPage() {
  const [foreignAmount, setForeignAmount] = useState(1000);
  const [rateAtRecognition, setRateAtRecognition] = useState(18);
  const [rateAtSettlement, setRateAtSettlement] = useState(18.5);
  const [positionType, setPositionType] = useState<FxPositionType>('asset');
  const [mode, setMode] = useState<CalculationMode>('realized');

  // Optional rate look-up
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('ZAR');
  const [recognitionDate, setRecognitionDate] = useState(today());
  const [settlementDate, setSettlementDate] = useState(today());
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const gainLoss = useMemo(() => {
    return mode === 'realized'
      ? calculateRealizedFxGainLoss(foreignAmount, rateAtRecognition, rateAtSettlement, positionType)
      : calculateUnrealizedFxGainLoss(foreignAmount, rateAtRecognition, rateAtSettlement, positionType);
  }, [mode, foreignAmount, rateAtRecognition, rateAtSettlement, positionType]);

  const valueAtRecognition = foreignAmount * rateAtRecognition;
  const valueAtSettlement = foreignAmount * rateAtSettlement;

  async function handleLookup() {
    setLookupMessage(null);
    setIsLookingUp(true);
    try {
      const [recognitionRate, settlementRate] = await Promise.all([
        exchangeRateService.getRateForDate(fromCurrency.trim().toUpperCase(), toCurrency.trim().toUpperCase(), new Date(recognitionDate).toISOString()),
        exchangeRateService.getRateForDate(fromCurrency.trim().toUpperCase(), toCurrency.trim().toUpperCase(), new Date(settlementDate).toISOString()),
      ]);

      const missing: string[] = [];
      if (recognitionRate) {
        setRateAtRecognition(recognitionRate.rate);
      } else {
        missing.push(`recognition date (${recognitionDate})`);
      }
      if (settlementRate) {
        setRateAtSettlement(settlementRate.rate);
      } else {
        missing.push(`${mode === 'realized' ? 'settlement' : 'revaluation'} date (${settlementDate})`);
      }

      if (missing.length > 0) {
        setLookupMessage(
          `No recorded ${fromCurrency.trim().toUpperCase()}/${toCurrency.trim().toUpperCase()} rate on or before ${missing.join(' and ')} — record one on the Exchange Rates page, or enter the rate manually below.`,
        );
      } else {
        setLookupMessage('Rates filled in from the Exchange Rates register.');
      }
    } finally {
      setIsLookingUp(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="FX calculator"
        description="Realized and unrealized foreign exchange gain/loss. A standalone tool — it does not read or post to any Invoice, Bill, Customer, Supplier, or Bank Account; this codebase does not yet support a foreign transaction currency on those documents."
      />

      <SectionCard title="Optional: auto-fill rates from the Exchange Rates register">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="fx-calc-from">From Currency</FieldLabel>
              <Input id="fx-calc-from" className="font-mono uppercase" value={fromCurrency} onChange={(e) => setFromCurrency(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="fx-calc-to">To Currency</FieldLabel>
              <Input id="fx-calc-to" className="font-mono uppercase" value={toCurrency} onChange={(e) => setToCurrency(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="fx-calc-recognition-date">Recognition Date</FieldLabel>
              <Input id="fx-calc-recognition-date" type="date" value={recognitionDate} onChange={(e) => setRecognitionDate(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="fx-calc-settlement-date">{mode === 'realized' ? 'Settlement Date' : 'Revaluation Date'}</FieldLabel>
              <Input id="fx-calc-settlement-date" type="date" value={settlementDate} onChange={(e) => setSettlementDate(e.target.value)} />
            </Field>
          </div>
          <div>
            <Button type="button" variant="outline" size="sm" disabled={isLookingUp} onClick={() => void handleLookup()}>
              {isLookingUp ? 'Looking up…' : 'Look up rates'}
            </Button>
          </div>
          {lookupMessage && <p className="text-sm text-muted-foreground">{lookupMessage}</p>}
        </div>
      </SectionCard>

      <SectionCard>
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-6">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Calculation</legend>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="mode" className="accent-primary" checked={mode === 'realized'} onChange={() => setMode('realized')} />
                  Realized (actual settlement)
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="mode" className="accent-primary" checked={mode === 'unrealized'} onChange={() => setMode('unrealized')} />
                  Unrealized (period-end revaluation)
                </label>
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Position Type</legend>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="positionType" className="accent-primary" checked={positionType === 'asset'} onChange={() => setPositionType('asset')} />
                  Asset (e.g. foreign receivable)
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="positionType" className="accent-primary" checked={positionType === 'liability'} onChange={() => setPositionType('liability')} />
                  Liability (e.g. foreign payable)
                </label>
              </div>
            </fieldset>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="fx-calc-amount">Foreign Amount</FieldLabel>
              <Input id="fx-calc-amount" type="number" step="0.01" className="text-right" value={foreignAmount} onChange={(e) => setForeignAmount(parseFloat(e.target.value) || 0)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="fx-calc-rate-recognition">Rate at Recognition</FieldLabel>
              <Input id="fx-calc-rate-recognition" type="number" step="0.0001" className="text-right" value={rateAtRecognition} onChange={(e) => setRateAtRecognition(parseFloat(e.target.value) || 0)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="fx-calc-rate-settlement">{mode === 'realized' ? 'Rate at Settlement' : 'Rate at Revaluation'}</FieldLabel>
              <Input id="fx-calc-rate-settlement" type="number" step="0.0001" className="text-right" value={rateAtSettlement} onChange={(e) => setRateAtSettlement(parseFloat(e.target.value) || 0)} />
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Result">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Value at recognition</span>
              <span className="figure text-sm tabular-nums">{formatCurrency(valueAtRecognition)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Value at {mode === 'realized' ? 'settlement' : 'revaluation'}</span>
              <span className="figure text-sm tabular-nums">{formatCurrency(valueAtSettlement)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {mode === 'realized' ? 'Realized' : 'Unrealized'} FX Gain/(Loss) — {positionType}
              </span>
              <Amount value={gainLoss} statement className="text-base font-semibold" />
            </div>
          </div>
          <FieldDescription>
            {positionType === 'asset'
              ? 'Asset position: the rate rising between the two dates is a GAIN (each foreign-currency unit converts to more).'
              : 'Liability position: the rate rising between the two dates is a LOSS (settling the same foreign-currency debt now costs more).'}
          </FieldDescription>
        </div>
      </SectionCard>
    </div>
  );
}
