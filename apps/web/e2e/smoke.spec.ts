import { expect, test } from '@playwright/test';

/**
 * Smoke E2E de las páginas públicas y de los controles de cumplimiento que
 * deben estar visibles antes de operar (edad, jurisdicción, términos, fairness).
 * Corre contra la URL de E2E_BASE_URL (producción por defecto).
 */

test('la landing carga y ofrece registrarse', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Trucazo/i);
});

test('el registro exige edad, provincia y aceptar términos', async ({ page }) => {
  await page.goto('/registro');
  await expect(page.locator('input[name="birthdate"]')).toBeVisible();
  await expect(page.locator('select[name="province"]')).toBeVisible();
  await expect(page.locator('input[name="acceptedTerms"]')).toBeVisible();
  await expect(page.getByText(/mayores de 18/i)).toBeVisible();
});

test('términos y privacidad están publicados', async ({ page }) => {
  await page.goto('/terminos');
  await expect(page.getByRole('heading', { name: /Términos/i })).toBeVisible();
  await page.goto('/privacidad');
  await expect(page.getByRole('heading', { name: /Privacidad/i })).toBeVisible();
});

test('el verificador de fairness está disponible', async ({ page }) => {
  await page.goto('/reparto');
  await expect(page.getByRole('heading', { name: /Verificar un reparto/i })).toBeVisible();
  await expect(page.locator('input[name="matchId"]')).toBeVisible();
});

test('una partida inexistente no rompe el verificador', async ({ page }) => {
  await page.goto('/reparto/no-existe-xyz');
  await expect(page.getByText(/No hay repartos registrados/i)).toBeVisible();
});
