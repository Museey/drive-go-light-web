'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { importCsvAction } from '../actions';
import type { FormResult } from '@/lib/mutate';
import type { CsvImportResult } from '@/lib/products-csv';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn primary" type="submit" disabled={pending}>
    {pending ? 'กำลังนำเข้า…' : 'นำเข้าไฟล์'}
  </button>;
}

export function CsvImport() {
  const [state, action] = useActionState<FormResult & { result?: CsvImportResult }, FormData>(
    importCsvAction, {},
  );

  return (
    <form className="form" action={action}>
      {state.error ? <div className="err">{state.error}</div> : null}

      {state.result ? (
        <div className={state.result.errors.length ? 'note' : 'ok-msg'}>
          <div>
            เพิ่มใหม่ {state.result.created} รายการ ·
            แก้ของเดิม {state.result.updated} รายการ ·
            ข้าม {state.result.skipped} รายการ
          </div>
          {state.result.errors.length ? (
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {state.result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
              {state.result.errors.length > 10 ? (
                <li>…และอีก {state.result.errors.length - 10} บรรทัด</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="tag-row">
        <input className="in" type="file" name="file" accept=".csv,text/csv" required />
        <Submit />
      </div>
    </form>
  );
}
