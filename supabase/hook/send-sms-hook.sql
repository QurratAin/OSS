
declare
  twilio_account_sid text := current_setting('app.settings.twilio_account_sid', true);
  twilio_auth_token text := current_setting('app.settings.twilio_auth_token', true);
  twilio_from_number text := current_setting('app.settings.twilio_from_number', true);
  twilio_url text;
  response json;
  phone_number text;
  otp text;
begin
  -- Get the phone number from the request payload
  phone_number := current_setting('request.jwt.claims', true)::json->>'phone_number';

  -- Validate phone number exists
  if phone_number is null then
    raise exception 'Phone number is required';
  end if;

  -- Check if user exists in users table
  if not exists (
    select 1 from users where phone_number = phone_number
  ) then
    return json_build_object(
      'statusCode', 403,
      'error', 'Unauthorized phone number'
    );
  end if;

  -- Generate OTP
  otp := floor(random() * (999999 - 100000 + 1) + 100000)::text;

  -- Construct Twilio API URL
  twilio_url := 'https://api.twilio.com/2010-04-01/Accounts/' || twilio_account_sid || '/Messages.json';

  -- Send SMS using Twilio
  select content into response
  from http((
    'POST',
    twilio_url,
    array[
      ('Content-Type', 'application/x-www-form-urlencoded'),
      ('Authorization', 'Basic ' || encode(twilio_account_sid || ':' || twilio_auth_token, 'base64'))
    ],
    'application/x-www-form-urlencoded',
    'To=' || phone_number || 
    '&From=' || twilio_from_number || 
    '&Body=Your verification code is: ' || otp
  )::http_request);

  -- Return success with OTP
  return json_build_object(
    'statusCode', 200,
    'otp', otp,
    'message', 'OTP sent successfully'
  );

exception when others then
  -- Return error response
  return json_build_object(
    'statusCode', 500,
    'error', sqlerrm
  );
end;