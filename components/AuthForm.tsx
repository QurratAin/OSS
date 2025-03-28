'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';

export default function AuthForm() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formattedPhone = phoneNumber.replace(/\D/g, '');
  
      // Check public.users      
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('phone_number', formattedPhone)
        .single()

      if (!data) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 403
        })}
 
      // proceed with otp      
      const { error } = await supabase.auth.signInWithOtp({
        phone: `+${formattedPhone}`,
        options: {
          shouldCreateUser: true,
          channel: 'sms' // Force SMS instead of app links
        }
      });

      if (error) throw error;

      setIsOtpSent(true);
      toast({
        title: 'OTP Sent',
        description: 'Please check your phone for the verification code.',
      });
      
    } catch (error: any) {
      console.error('Error sending OTP:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send OTP. Please try again.',
        variant: 'destructive',
      });
    }

    setIsLoading(false);
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: phoneNumber,
        token: otp,
        type: 'sms'
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Authentication successful!',
      });
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Error verifying OTP:', error);
      toast({
        title: 'Error',
        description: error.message || 'Invalid OTP. Please try again.',
        variant: 'destructive',
      });
    }

    setIsLoading(false);
  };

  return (
    <Card className="p-6">
      {!isOtpSent ? (
        <form onSubmit={handleSendOTP} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="phone" className="text-sm font-medium text-gray-700">
              Phone Number
            </label>
            <Input
              id="phone"
              type="tel"
              placeholder="+1 (555) 555-5555"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? 'Sending...' : 'Send OTP'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOTP} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="otp" className="text-sm font-medium text-gray-700">
              Enter OTP
            </label>
            <Input
              id="otp"
              type="text"
              placeholder="Enter 6-digit code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? 'Verifying...' : 'Verify OTP'}
          </Button>
        </form>
      )}
    </Card>
  );
}