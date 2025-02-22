import React from 'react';
import { Text, GestureResponderEvent } from 'react-native';

interface GestureTextProps {
  children: React.ReactNode;
  onLongPress?: (event: GestureResponderEvent) => void;
  onPress?: (event: GestureResponderEvent) => void;
  onPressIn?: (event: GestureResponderEvent) => void;
  onPressOut?: (event: GestureResponderEvent) => void;
  selectable: boolean;
  style?: any;
}

const GestureText: React.FC<GestureTextProps> = ({
  children,
  onLongPress,
  onPress,
  onPressIn,
  onPressOut,
  style,
  selectable,
  ...props
}) => {
  return (
    <Text
      {...props}
      style={style}
      onLongPress={onLongPress}
      onPress={onPress ? onPress : () => {}}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      selectable={selectable}
    >
      {children}
    </Text>
  );
};


export default GestureText;
