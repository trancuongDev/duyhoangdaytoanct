import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Lấy tất cả lớp đã hết hạn
  const today = new Date().toISOString().split('T')[0];
  const { data: expiredClasses } = await supabase
    .from('classes')
    .select('name')
    .lt('end_date', today)
    .not('end_date', 'is', null);

  if (!expiredClasses?.length) {
    return new Response(JSON.stringify({ locked: 0, message: 'No expired classes' }), { status: 200 });
  }

  const classNames = expiredClasses.map(c => c.name);

  // Khóa hàng loạt
  const { data, error } = await supabase
    .from('students')
    .update({ active: false })
    .in('class_name', classNames)
    .eq('active', true)
    .eq('manually_unlocked', false)
    .select('id');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({
    locked: data?.length ?? 0,
    classes: classNames,
    message: `Locked ${data?.length ?? 0} students from ${classNames.length} expired classes`
  }), { status: 200 });
});
