import { View, Text } from 'react-native';
import { useEffect } from 'react';
import { logWithTimestamp } from '@/utils/logging';

export default function PaymentScreen() {
  useEffect(() => {
    logWithTimestamp('app/payment', '🔧 Payment screen loaded');
  }, []);

  return (
    <View>
      <Text>Payment Screen (Placeholder)</Text>
    </View>
  );
}
