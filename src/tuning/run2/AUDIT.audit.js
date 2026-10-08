import { auditAll } from '../audit';
jest.setTimeout(3600000);
test('audit exploitation du kit', () => {
  const r = auditAll();
  expect(Object.keys(r).length).toBe(12);
});
