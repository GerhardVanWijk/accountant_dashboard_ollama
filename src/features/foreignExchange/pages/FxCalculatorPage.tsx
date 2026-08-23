import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { fieldHint, fieldInput, fieldLabel } from '../components/formStyles';
import { exchangeRateService } from '../services';
import { calculateRealizedFxGainLoss, calculateUnrealizedFxGainLoss, type FxPositionType } from '../services/fxCalculations';

type CalculationMode = 'realized' | 'unrealized';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A genuinely standalone FX gain/loss calculator — works with zero other
 * module dependencies, pure client-side arithmetic on user-typed numbers
 * via fxCalculations.ts (SA_ACCOUNTING_MASTER_SPEC.md §33). Route
 * `/foreign-exchange/calculator` (wired centrally by a later Queen
 * integration pass).
 *
 * SCOPE NOTE: this tool does not read from, or post to, any real
 * Invoice/Bill/Customer/Supplier/BankAccount — none of those types carry a
 * foreign transaction currency in this codebase yet. The optional
 * "look up rates" section below is a real integration with THIS module's
 * own ExchangeRateService (exchangeRateService.getRateForDate()) only —
 * it never invents or interpolates a rate: if no rate is on file for a
 * date, it says so and leaves the rate field for manual entry.
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
    <div className="flex flex-col gap-lg">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">FX Calculator</h1>
        <p className="mt-xs text-sm text-text-secondary">
          Realized and unrealized foreign exchange gain/loss (SA_ACCOUNTING_MASTER_SPEC.md §33). A standalone tool —
          it does not read or post to any Invoice, Bill, Customer, Supplier, or Bank Account; this codebase does not
          yet support a foreign transaction currency on those documents. Everything below is either typed in
          directly or looked up from this module's own Exchange Rates register.
        </p>
      </div>

      <Card className="flex flex-col gap-md">
        <h2 className="text-sm font-semibold text-text-primary">Optional: auto-fill rates from the Exchange Rates register</h2>
        <div className="grid grid-cols-1 gap-md md:grid-cols-4">
          <label>
            <span className={fieldLabel}>From Currency</span>
            <input className={`${fieldInput} font-mono uppercase`} value={fromCurrency} onChange={(e) => setFromCurrency(e.target.value)} />
          </label>
          <label>
            <span className={fieldLabel}>To Currency</span>
            <input className={`${fieldInput} font-mono uppercase`} value={toCurrency} onChange={(e) => setToCurrency(e.target.value)} />
          </label>
          <label>
            <span className={fieldLabel}>Recognition Date</span>
            <input type="date" className={fieldInput} value={recognitionDate} onChange={(e) => setRecognitionDate(e.target.value)} />
          </label>
          <label>
            <span className={fieldLabel}>{mode === 'realized' ? 'Settlement Date' : 'Revaluation Date'}</span>
            <input type="date" className={fieldInput} value={settlementDate} onChange={(e) => setSettlementDate(e.target.value)} />
          </label>
        </div>
        <div>
          <Button variant="secondary" type="button" onClick={() => void handleLookup()} disabled={isLookingUp}>
            {isLookingUp ? 'Looking up…' : 'Look Up Rates'}
          </Button>
        </div>
        {lookupMessage && <p className={fieldHint}>{lookupMessage}</p>}
      </Card>

      <Card className="flex flex-col gap-md">
        <div className="flex flex-wrap gap-lg">
          <fieldset className="flex flex-col gap-xs">
            <legend className={fieldLabel}>Calculation</legend>
            <div className="flex gap-md text-sm">
              <label className="flex items-center gap-xs">
                <input type="radio" name="mode" checked={mode === 'realized'} onChange={() => setMode('realized')} />
                Realized (actual settlement)
              </label>
              <label className="flex items-center gap-xs">
                <input type="radio" name="mode" checked={mode === 'unrealized'} onChange={() => setMode('unrealized')} />
                Unrealized (period-end revaluation)
              </label>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-xs">
            <legend className={fieldLabel}>Position Type</legend>
            <div className="flex gap-md text-sm">
              <label className="flex items-center gap-xs">
                <input type="radio" name="positionType" checked={positionType === 'asset'} onChange={() => setPositionType('asset')} />
                Asset (e.g. foreign receivable)
              </label>
              <label className="flex items-center gap-xs">
                <input type="radio" name="positionType" checked={positionType === 'liability'} onChange={() => setPositionType('liability')} />
                Liability (e.g. foreign payable)
              </label>
            </div>
          </fieldset>
        </div>

        <div className="grid grid-cols-1 gap-md md:grid-cols-3">
          <label>
            <span className={fieldLabel}>Foreign Amount</span>
            <input
              type="number"
              step="0.01"
              className={`${fieldInput} text-right tabular-nums`}
              value={foreignAmount}
              onChange={(e) => setForeignAmount(parseFloat(e.target.value) || 0)}
            />
          </label>
          <label>
            <span className={fieldLabel}>Rate at Recognition</span>
            <input
              type="number"
              step="0.0001"
              className={`${fieldInput} text-right tabular-nums`}
              value={rateAtRecognition}
              onChange={(e) => setRateAtRecognition(parseFloat(e.target.value) || 0)}
            />
          </label>
          <label>
            <span className={fieldLabel}>{mode === 'realized' ? 'Rate at Settlement' : 'Rate at Revaluation'}</span>
            <input
              type="number"
              step="0.0001"
              className={`${fieldInput} text-right tabular-nums`}
              value={rateAtSettlement}
              onChange={(e) => setRateAtSettlement(parseFloat(e.target.value) || 0)}
            />
          </label>
        </div>
      </Card>

      <Card className="flex flex-col gap-sm">
        <h2 className="text-sm font-semibold text-text-primary">Result</h2>
        <div className="grid grid-cols-1 gap-sm text-sm md:grid-cols-3">
          <div className="flex flex-col gap-xs">
            <span className="text-text-secondary">Value at recognition</span>
            <span className="tabular-nums font-mono text-text-primary">{formatCurrency(valueAtRecognition)}</span>
          </div>
          <div className="flex flex-col gap-xs">
            <span className="text-text-secondary">Value at {mode === 'realized' ? 'settlement' : 'revaluation'}</span>
            <span className="tabular-nums font-mono text-text-primary">{formatCurrency(valueAtSettlement)}</span>
          </div>
          <div className="flex flex-col gap-xs">
            <span className="text-text-secondary">
              {mode === 'realized' ? 'Realized' : 'Unrealized'} FX Gain/(Loss) — {positionType}
            </span>
            <FinancialNumber value={gainLoss} format={formatCurrency} className="font-mono text-base" />
          </div>
        </div>
        <p className={fieldHint}>
          {positionType === 'asset'
            ? 'Asset position: the rate rising between the two dates is a GAIN (each foreign-currency unit converts to more).'
            : 'Liability position: the rate rising between the two dates is a LOSS (settling the same foreign-currency debt now costs more).'}
        </p>
      </Card>
    </div>
  );
}
