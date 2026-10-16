const setupFile = {
  local_owner_id: 'local-compartido.sql',
  sales_summary: 'mejoras-operacion.sql',
  sales_page: 'mejoras-operacion.sql',
  save_daily_menu: 'mejoras-operacion.sql',
  add_daily_expense: 'gastos-diarios.sql',
  delete_daily_expense: 'gastos-diarios.sql',
};

export function explainSchemaError(error, functionName) {
  if (error?.code === 'PGRST202' && setupFile[functionName]) {
    const explained = new Error(`Falta actualizar Supabase. Ejecutá ${setupFile[functionName]} en SQL Editor y recargá la app.`, { cause: error });
    explained.code = error.code;
    return explained;
  }
  if (error?.code === 'PGRST202') {
    const explained = new Error('Falta una función en Supabase. Revisá las migraciones y recargá la app.', { cause: error });
    explained.code = error.code;
    return explained;
  }
  if (error?.code === 'PGRST205' || error?.code === '42P01') {
    const explained = new Error(functionName === 'daily_expenses'
      ? 'Falta actualizar Supabase. Ejecutá gastos-diarios.sql en SQL Editor y recargá la app.'
      : 'Falta una tabla en Supabase. Revisá la instalación del esquema del proyecto.', { cause: error });
    explained.code = error.code;
    return explained;
  }
  return error;
}
