"use client";

import { ArrowUpIcon, CalendarIcon, MailIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "@/components/ui/autocomplete";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckboxGroup } from "@/components/ui/checkbox-group";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@/components/ui/combobox";
import {
  Composer,
  ComposerActionGroup,
  ComposerActions,
  ComposerInput,
  ComposerSubmit,
} from "@/components/ui/composer";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldScrubArea,
} from "@/components/ui/number-field";
import { OTPField, OTPFieldInput, OTPFieldSeparator } from "@/components/ui/otp-field";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import {
  Select,
  SelectItem,
  SelectLabel,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toastManager } from "@/components/ui/toast";

import { Section } from "../_components/section";

const sites = [
  { value: "acidalia", label: "Acidalia Planitia" },
  { value: "ares3", label: "Ares 3 Hab" },
  { value: "ares4", label: "Ares 4 MAV" },
  { value: "pathfinder", label: "Pathfinder" },
  { value: "schiaparelli", label: "Schiaparelli Crater" },
];

const selectItems = [
  { label: "Select a rover", value: null },
  { label: "Rover 1", value: "rover-1" },
  { label: "Rover 2", value: "rover-2" },
  { label: "Sojourner", value: "sojourner" },
];

const otpSlots = [1, 2, 3, 4, 5, 6];

function DatePickerDemo() {
  const [date, setDate] = useState<Date>();

  return (
    <Popover>
      <PopoverTrigger
        render={<Button className="w-64 justify-start text-left font-normal" variant="outline" />}
      >
        <CalendarIcon />
        {date ? date.toLocaleDateString(undefined, { dateStyle: "long" }) : "Pick a date"}
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-auto p-0">
        <Calendar mode="single" onSelect={setDate} selected={date} />
      </PopoverPopup>
    </Popover>
  );
}

export function Forms() {
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(new Date());

  return (
    <>
      <Section id="input" title="Input" className="max-w-full flex-col">
        <Input aria-label="Default input" placeholder="Default" className="max-w-sm" />
        <Input aria-label="Small input" placeholder="Small" size="sm" className="max-w-sm" />
        <Input aria-label="Large input" placeholder="Large" size="lg" className="max-w-sm" />
        <Input aria-label="Disabled input" placeholder="Disabled" disabled className="max-w-sm" />
      </Section>

      <Section id="input-group" title="Input Group" className="flex-col">
        <InputGroup className="max-w-sm">
          <InputGroupInput aria-label="Email" placeholder="Email" type="email" />
          <InputGroupAddon>
            <MailIcon />
          </InputGroupAddon>
        </InputGroup>
        <InputGroup className="max-w-sm">
          <InputGroupAddon>
            <InputGroupText>https://</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput aria-label="Website" placeholder="imstuckonmars.help" />
        </InputGroup>
        <InputGroup className="max-w-sm">
          <InputGroupInput aria-label="Search" placeholder="Search" />
          <InputGroupAddon align="inline-end">
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
      </Section>

      <Section id="textarea" title="Textarea">
        <Textarea aria-label="Log entry" className="max-w-md" placeholder="Log entry" />
      </Section>

      <Section id="label" title="Label">
        <div className="flex flex-col gap-2">
          <Label htmlFor="label-demo">Callsign</Label>
          <Input id="label-demo" placeholder="Ares III" className="w-64" />
        </div>
      </Section>

      <Section id="field" title="Field">
        <Field className="w-72">
          <FieldLabel>Crew name</FieldLabel>
          <Input placeholder="Mark Watney" />
          <FieldDescription>Shown on mission logs</FieldDescription>
        </Field>
        <Field className="w-72" invalid>
          <FieldLabel>Oxygen reserve</FieldLabel>
          <Input defaultValue="-3" />
          <FieldError match>Must be a positive number</FieldError>
        </Field>
      </Section>

      <Section id="fieldset" title="Fieldset">
        <Fieldset className="w-72">
          <FieldsetLegend>Hab settings</FieldsetLegend>
          <Field>
            <FieldLabel>Temperature</FieldLabel>
            <Input defaultValue="21 °C" />
          </Field>
          <Field>
            <FieldLabel>Pressure</FieldLabel>
            <Input defaultValue="101 kPa" />
          </Field>
        </Fieldset>
      </Section>

      <Section id="form" title="Form">
        <Form
          className="flex w-72 flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            toastManager.add({ title: "Message queued for Earth" });
          }}
        >
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input name="email" required type="email" />
            <FieldError>Enter a valid email.</FieldError>
          </Field>
          <Button type="submit">Send</Button>
        </Form>
      </Section>

      <Section id="checkbox" title="Checkbox">
        <Label>
          <Checkbox />
          Unchecked
        </Label>
        <Label>
          <Checkbox defaultChecked />
          Checked
        </Label>
        <Label>
          <Checkbox indeterminate />
          Indeterminate
        </Label>
        <Label>
          <Checkbox disabled />
          Disabled
        </Label>
      </Section>

      <Section id="checkbox-group" title="Checkbox Group">
        <CheckboxGroup aria-label="Supplies" defaultValue={["potatoes"]}>
          <Label>
            <Checkbox name="potatoes" value="potatoes" />
            Potatoes
          </Label>
          <Label>
            <Checkbox name="water" value="water" />
            Water
          </Label>
          <Label>
            <Checkbox name="ketchup" value="ketchup" />
            Ketchup
          </Label>
        </CheckboxGroup>
      </Section>

      <Section id="radio-group" title="Radio Group">
        <RadioGroup aria-label="Rover" defaultValue="rover-1">
          <Label>
            <Radio value="rover-1" /> Rover 1
          </Label>
          <Label>
            <Radio value="rover-2" /> Rover 2
          </Label>
          <Label>
            <Radio value="sojourner" /> Sojourner
          </Label>
        </RadioGroup>
      </Section>

      <Section id="switch" title="Switch">
        <Label>
          <Switch defaultChecked />
          Life support
        </Label>
        <Label>
          <Switch />
          Heater
        </Label>
        <Label>
          <Switch disabled />
          Disabled
        </Label>
      </Section>

      <Section id="slider" title="Slider" className="flex-col">
        <Slider aria-label="Volume" className="max-w-sm" defaultValue={40} />
        <Slider aria-label="Range" className="max-w-sm" defaultValue={[20, 80]} />
      </Section>

      <Section id="select" title="Select">
        <Select items={selectItems}>
          <SelectTrigger aria-label="Rover" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            <SelectLabel>Rovers</SelectLabel>
            {selectItems.map((item) => (
              <SelectItem key={item.label} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </Section>

      <Section id="combobox" title="Combobox">
        <Combobox items={sites}>
          <ComboboxInput aria-label="Landing site" className="w-64" placeholder="Landing site" />
          <ComboboxPopup>
            <ComboboxEmpty>No sites found.</ComboboxEmpty>
            <ComboboxList>
              {(item: (typeof sites)[number]) => (
                <ComboboxItem key={item.value} value={item}>
                  {item.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxPopup>
        </Combobox>
      </Section>

      <Section id="autocomplete" title="Autocomplete">
        <Autocomplete items={sites}>
          <AutocompleteInput
            aria-label="Search sites"
            className="w-64"
            placeholder="Search sites"
          />
          <AutocompletePopup>
            <AutocompleteEmpty>No sites found.</AutocompleteEmpty>
            <AutocompleteList>
              {(item: (typeof sites)[number]) => (
                <AutocompleteItem key={item.value} value={item}>
                  {item.label}
                </AutocompleteItem>
              )}
            </AutocompleteList>
          </AutocompletePopup>
        </Autocomplete>
      </Section>

      <Section id="number-field" title="Number Field">
        <NumberField className="w-48" defaultValue={549} min={0}>
          <NumberFieldScrubArea label="Sol" />
          <NumberFieldGroup>
            <NumberFieldDecrement />
            <NumberFieldInput />
            <NumberFieldIncrement />
          </NumberFieldGroup>
        </NumberField>
      </Section>

      <Section id="otp-field" title="OTP Field">
        <OTPField aria-label="Verification code" length={6}>
          {otpSlots.map((slot) => (
            <OTPFieldSlot key={slot} slot={slot} />
          ))}
        </OTPField>
      </Section>

      <Section id="calendar" title="Calendar">
        <Calendar
          className="rounded-lg border"
          mode="single"
          onSelect={setCalendarDate}
          selected={calendarDate}
        />
      </Section>

      <Section id="date-picker" title="Date Picker">
        <DatePickerDemo />
      </Section>

      <Section id="composer" title="Composer">
        <Composer
          className="w-full max-w-lg"
          onSubmit={() => toastManager.add({ title: "Message sent" })}
        >
          <ComposerInput aria-label="Message" placeholder="Message mission control…" />
          <ComposerActions>
            <ComposerActionGroup align="end">
              <ComposerSubmit
                render={
                  <Button aria-label="Send message" size="icon">
                    <ArrowUpIcon aria-hidden="true" />
                  </Button>
                }
              />
            </ComposerActionGroup>
          </ComposerActions>
        </Composer>
      </Section>
    </>
  );
}

function OTPFieldSlot({ slot }: { slot: number }) {
  return (
    <>
      {slot === 4 ? <OTPFieldSeparator /> : null}
      <OTPFieldInput aria-label={`Character ${slot} of 6`} />
    </>
  );
}
