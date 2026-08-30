'use client';

import { useActionState, useState } from 'react';
import { createCategoryAction, deleteCategoryAction, renameCategoryAction } from './actions';
import type { FormResult } from '@/lib/mutate';
import type { Category } from '@/lib/products';

/**
 * จัดการหมวดหมู่สินค้า
 * ลบหมวดหมู่ไม่ได้ทำให้สินค้าหาย แค่กลายเป็นไม่ระบุหมวด — บอกไว้ให้ชัดก่อนกด
 */
export function CategoryManager({ categories }: { categories: Category[] }) {
  const [state, addAction] = useActionState<FormResult, FormData>(createCategoryAction, {});
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className="body">
      {state.error ? <div className="err" style={{ marginBottom: 12 }}>{state.error}</div> : null}

      <form action={addAction} className="tag-row" style={{ marginBottom: 14 }}>
        <input className="in" name="name" placeholder="ชื่อหมวดหมู่ใหม่" style={{ width: 220 }} required />
        <button className="btn" type="submit">เพิ่มหมวดหมู่</button>
      </form>

      {categories.length === 0 ? (
        <span className="subtle">ยังไม่มีหมวดหมู่</span>
      ) : (
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr><th>หมวดหมู่</th><th className="num">สินค้า</th><th style={{ width: 260 }} /></tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>
                    {editing === c.id ? (
                      <input className="in" value={name} autoFocus
                             onChange={(e) => setName(e.target.value)} />
                    ) : c.name}
                  </td>
                  <td className="num">{c.productCount}</td>
                  <td>
                    {editing === c.id ? (
                      <div className="tag-row">
                        <form action={async () => { await renameCategoryAction(c.id, name); setEditing(null); }}>
                          <button className="btn" type="submit">บันทึก</button>
                        </form>
                        <button className="btn" type="button" onClick={() => setEditing(null)}>ยกเลิก</button>
                      </div>
                    ) : confirmDelete === c.id ? (
                      <div className="tag-row">
                        <span style={{ fontSize: 12.5 }}>
                          {c.productCount > 0
                            ? `สินค้า ${c.productCount} รายการจะกลายเป็นไม่ระบุหมวด`
                            : 'ยืนยันลบหมวดหมู่นี้?'}
                        </span>
                        <form action={async () => { await deleteCategoryAction(c.id); setConfirmDelete(null); }}>
                          <button className="btn danger" type="submit">ลบ</button>
                        </form>
                        <button className="btn" type="button" onClick={() => setConfirmDelete(null)}>ไม่ลบ</button>
                      </div>
                    ) : (
                      <div className="tag-row">
                        <button className="btn" type="button"
                                onClick={() => { setEditing(c.id); setName(c.name); }}>
                          เปลี่ยนชื่อ
                        </button>
                        <button className="btn" type="button" onClick={() => setConfirmDelete(c.id)}>ลบ</button>
                      </div>
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
}
