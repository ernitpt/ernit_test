import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types'; // Ensure this path is correct

type LandingScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Landing'>;

const LandingScreen = () => {
  const navigation = useNavigation<LandingScreenNavigationProp>();

  const handleSignIn = () => {
    navigation.navigate('Auth', { mode: 'signin' });
  };

  const handleSignUp = () => {
    navigation.navigate('Auth', { mode: 'signup' });
  };

  return (
    <LinearGradient
      colors={['#7C3AED', '#3B82F6']}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar style="light" />
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32 }}>
          
          {/* Top Section - Logo & Tagline */}
          <View style={{ alignItems: 'center' }}>
            
            <Image
              // IMPORTANT: Make sure this relative path is correct for your file structure
              source={require('../assets/icon.png')}
              style={{
                width: 120,
                height: 120,
                marginBottom: 16,
              }}
              resizeMode="contain"
            />

            {/* Logo Text */}
            <View style={{ marginBottom: 32, alignItems: 'center' }}>
              <Text style={{ 
                fontSize: 46, 
                fontWeight: 'bold', 
                color: 'white', 
                textAlign: 'center', 
                marginBottom: 8 
              }}>
                Ernit
              </Text>
              <Text style={{ 
                fontSize: 20, 
                color: '#E9D5FF', 
                textAlign: 'center' 
              }}>
                Gamified Rewards & Experiences
              </Text>
            </View>
          </View>

          {/* Bottom Section - Two Options */}
          <View style={{ marginTop: 30 }}>
            {/* Sign In Button */}
            <TouchableOpacity
              onPress={handleSignIn}
              style={{
                backgroundColor: 'white',
                borderRadius: 24,
                padding: 20,
                marginBottom: 16,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 5,
              }}
              activeOpacity={0.8}
            >
              <Text style={{ 
                fontSize: 20, 
                fontWeight: 'bold', 
                color: '#7C3AED', 
                textAlign: 'center' 
              }}>
                Sign In
              </Text>
              <Text style={{ 
                color: '#6B7280', 
                textAlign: 'center', 
                fontSize: 14, 
                marginTop: 4 
              }}>
                Access your account
              </Text>
            </TouchableOpacity>

            {/* Sign Up Button */}
            <TouchableOpacity
              onPress={handleSignUp}
              style={{
                backgroundColor: '#8B5CF6',
                borderRadius: 24,
                padding: 20,
                marginBottom: 16,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 5,
              }}
              activeOpacity={0.8}
            >
              <Text style={{ 
                fontSize: 20, 
                fontWeight: 'bold', 
                color: 'white', 
                textAlign: 'center' 
              }}>
                Sign Up
              </Text>
              <Text style={{ 
                color: '#E9D5FF', 
                textAlign: 'center', 
                fontSize: 14, 
                marginTop: 4 
              }}>
                Create a new account
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default LandingScreen;

