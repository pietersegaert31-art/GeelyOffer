import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getStandardEquipment } from './standardEquipment.js';

describe('getStandardEquipment', () => {
  test('returns an empty array for an unknown vehicle name', () => {
    assert.deepEqual(getStandardEquipment('Unknown Model', 'PRO'), []);
  });

  test('PRO and PRO+ get identical equipment lists (no MAX+ extras)', () => {
    const pro = getStandardEquipment('Geely E5', 'PRO');
    const proPlus = getStandardEquipment('Geely E5', 'PRO+');
    assert.deepEqual(pro, proPlus);
  });

  test('MAX+ includes everything PRO+ has, plus extras', () => {
    const proPlus = getStandardEquipment('Geely E5', 'PRO+');
    const maxPlus = getStandardEquipment('Geely E5', 'MAX+');

    const proPlusItemCount = proPlus.reduce((sum, group) => sum + group.items.length, 0);
    const maxPlusItemCount = maxPlus.reduce((sum, group) => sum + group.items.length, 0);
    assert.ok(maxPlusItemCount > proPlusItemCount, 'MAX+ should have strictly more items than PRO+');
  });

  test('E5 MAX+ never lists both 18" and 19" wheels at once (regression test for the contradiction bug)', () => {
    const maxPlus = getStandardEquipment('Geely E5', 'MAX+');
    const allItems = maxPlus.flatMap((group) => group.items);
    assert.ok(!allItems.includes('18" lichtmetalen wielen'), 'MAX+ should not still list the PRO/PRO+ 18" wheels');
    assert.ok(allItems.some((item) => item.includes('19" lichtmetalen wielen')), 'MAX+ should list 19" wheels');
  });

  test('every category name is unique within a single result', () => {
    for (const [name, model] of [['Geely E5', 'MAX+'], ['Starray EM-i', 'MAX+']]) {
      const categories = getStandardEquipment(name, model).map((g) => g.category);
      assert.equal(new Set(categories).size, categories.length, `${name} ${model} has duplicate category names`);
    }
  });
});
