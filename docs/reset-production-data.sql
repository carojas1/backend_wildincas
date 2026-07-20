-- Ejecutar una sola vez en Supabase > SQL Editor y luego redeplegar Render.
-- Elimina datos operativos y conserva la estructura de tablas y politicas.
begin;

truncate table
  public.simot_auth,
  public.simot_auth_users,
  public.simot_checklist,
  public.simot_employees,
  public.simot_finance,
  public.simot_guests,
  public.simot_incidents,
  public.simot_notifications,
  public.simot_operations,
  public.simot_reservations,
  public.simot_rooms,
  public.simot_state
restart identity;

commit;
