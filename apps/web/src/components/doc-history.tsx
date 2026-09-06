import { query } from '@/lib/auth';
import { editActionLabel, editorName, listDocEdits } from '@/lib/doc-edits';
import { thDateTime } from '@/lib/format';

/**
 * ประวัติการบันทึกของเอกสารหนึ่งใบ
 *
 * รุ่น 6.4 แสดงบรรทัด "บันทึกล่าสุด … โดย …" กับปุ่มเปิดหน้าต่างประวัติ
 * เราแสดงเป็นรายการที่พับไว้แทน จะได้ไม่ต้องมีหน้าต่างซ้อนหน้าต่าง
 * และยังกดพิมพ์ทั้งหน้าออกมาพร้อมประวัติได้
 */
export async function DocHistory({ documentId }: { documentId: string }) {
  const edits = await query((c) => listDocEdits(c, documentId));
  if (!edits.length) return null;

  const last = edits[0]!;

  return (
    <div className="card">
      <header>
        <h2>ประวัติการบันทึก</h2>
        <div className="spacer" />
        <span className="hint">
          ล่าสุด {thDateTime(last.at)} โดย {editorName(last)}
        </span>
      </header>
      <div className="body">
        <details>
          <summary style={{ cursor: 'pointer' }}>
            ดูทั้งหมด {edits.length} ครั้ง
          </summary>
          <div className="tablewrap" style={{ marginTop: 10, maxHeight: 320 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>ครั้งที่</th>
                  <th style={{ width: 180 }}>วันที่และเวลา</th>
                  <th style={{ width: 120 }}>การกระทำ</th>
                  <th>ผู้บันทึก</th>
                </tr>
              </thead>
              <tbody>
                {edits.map((e, i) => (
                  <tr key={i}>
                    <td className="num mono">{edits.length - i}</td>
                    <td>{thDateTime(e.at)}</td>
                    <td>{editActionLabel(e.action)}</td>
                    <td>{editorName(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            ระบบเก็บให้อัตโนมัติทุกครั้งที่เอกสารถูกบันทึก เก็บย้อนหลังได้ 100 ครั้งล่าสุด ·
            &quot;ระบบ&quot; หมายถึงเกิดจากการนำเข้าข้อมูลหรือเครื่องมือของผู้ดูแล ไม่ใช่คนกดในเว็บ
          </div>
        </details>
      </div>
    </div>
  );
}
