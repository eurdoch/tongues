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
      selectable={props.selectable !== undefined ? props.selectable : true}
    >
      {children}
    </Text>
  );
};

export default GestureText;
