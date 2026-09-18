-- Match device (Fitbit / Google Health) workouts to a logged session by rough time.
-- Window widened to ±60 min; closest start first, so a session logged at "about
-- midday" still finds the watch's own record even if the clocks disagree.
create or replace function public.session_device(p_started timestamptz, p_ended timestamptz)
returns setof public.device_metrics language sql stable security invoker as $$
  select * from public.device_metrics
  where owner = auth.uid() and kind = 'workout'
    and started_at between p_started - interval '60 minutes' and coalesce(p_ended, p_started) + interval '60 minutes'
  order by abs(extract(epoch from (started_at - p_started))) asc
  limit 3
$$;
