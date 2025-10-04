"use client";

import { ChangeEventHandler, FocusEventHandler, PropsWithChildren, useState } from "react";
import Image from "next/image";

interface InputProps {
  label: string;
  value?: string;
  readOnly?: boolean;
  name: string;
  type: string;
  className?: string;
  defaultValue?: string;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  bgColor?: string;
}

export const Input = (props : InputProps & PropsWithChildren) => {
  const bgColor = props.bgColor || "background"
  return (
    <div className={`relative mt-4 flex ${props.className}`}>
      <input
        onChange={props.onChange}
        type={props.type}
        id={props.name}
        name={props.name}
        onFocus={props.onFocus}
        onBlur={props.onBlur}
        className="block px-3 py-2 h-14 w-full text-sm text-foreground bg-transparent border border-primary rounded focus:outline-none focus:ring-0 peer"
        value={props.value}
        defaultValue={props.defaultValue}
        placeholder=" "
        readOnly={props.readOnly}
      />
      <label
        htmlFor={props.name}
        className={`absolute text-md text-foreground duration-200 transform 
                  -translate-y-[160%] scale-75 top-1/2 z-10 origin-[0] left-3 
                  peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2
                  peer-focus:scale-75 peer-focus:-translate-y-[160%] px-1`}
        style={{
          backgroundColor: bgColor
        }}
      >
        {props.label}
      </label>
      {props.children}
    </div>
  );
}

export const EmailInput = ({ defaultValue, readOnly = false, bgColor } : { defaultValue?: string, readOnly?: boolean, bgColor?: string }) => {

  return (
    <Input label={"Email"} name={"email"} type={"email"} readOnly={readOnly} defaultValue={defaultValue} bgColor={bgColor} />
  );
}

export const PasswordConfirmInput = ({bgColor}: {bgColor?: string}) => {

  return (
    <Input label={"Password Confirm"} name={"passwordConfirm"} type={"password"} bgColor={bgColor} />
  );
}

export const PasswordInput = (
  {onChange, value, onFocus, onBlur, bgColor}: 
  {onChange?: ChangeEventHandler<HTMLInputElement>, value?: string, onFocus?: FocusEventHandler<HTMLInputElement>, onBlur?: FocusEventHandler<HTMLInputElement>, bgColor?: string}
) => {
  const [ showPassword, setShowPassword ] = useState<boolean>(false);

  return (
    <Input label={"Password"} name={"password"} type={showPassword ? "text" : "password"} onChange={onChange} value={value} onFocus={onFocus} onBlur={onBlur} bgColor={bgColor}>
      <button type="button" className="absolute w-5 h-4 p-1 top-1/2 -translate-y-1/2 right-4 text-font" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}>
        <Image src={`/icons/${showPassword ? "hide_pw" : "show_pw"}.svg`} alt={""} fill />
      </button>
    </Input>
  );
}

export const NewPasswordInput = (
  {onChange, value, onFocus, onBlur, bgColor}: 
  {onChange?: ChangeEventHandler<HTMLInputElement>, value?: string, onFocus?: FocusEventHandler<HTMLInputElement>, onBlur?: FocusEventHandler<HTMLInputElement>, bgColor?: string}
) => {
  const [ showPassword, setShowPassword ] = useState<boolean>(false);

  return (
    <Input label={"New Password"} name={"newPassword"} type={showPassword ? "text" : "password"} onChange={onChange} value={value} onFocus={onFocus} onBlur={onBlur} bgColor={bgColor}>
      <button type="button" className="absolute w-5 h-4 p-1 top-1/2 -translate-y-1/2 right-4 text-font" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}>
        <Image src={`/icons/${showPassword ? "hide_pw" : "show_pw"}.svg`} alt={""} fill />
      </button>
    </Input>
  );
}