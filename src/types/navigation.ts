import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CompositeNavigationProp } from '@react-navigation/native';
import { RootStackParamList, GiverStackParamList, RecipientStackParamList } from './index';

// Base navigation prop for screens directly in RootStack
export type RootNavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Composite types for screens in nested stacks that also need RootStack routes
export type GiverNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<GiverStackParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

export type RecipientNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<RecipientStackParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

// Typed useNavigation hooks
export const useRootNavigation = () => useNavigation<RootNavigationProp>();
export const useGiverNavigation = () => useNavigation<GiverNavigationProp>();
export const useRecipientNavigation = () => useNavigation<RecipientNavigationProp>();
